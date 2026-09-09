import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { canDecideActivity, canProposeActivity, canVote } from '../../lib/permissions.ts'
import { publish } from '../../lib/sse.ts'
import { tally, type VoteValue } from '../../lib/vote.ts'
import { loadParticipant } from '../events/service.ts'
import type { CreateActivityInput, UpdateActivityInput } from './schema.ts'

// Règles métier des activités (conception §2.7, §3.3). Ce fichier ne connaît pas Hono : il
// reçoit l'identifiant de l'appelant en argument et lève des `ApiError`.

function assertPeriod(startsAt: Date | null, endsAt: Date | null): void {
  // Les deux bornes sont facultatives : une activité peut n'être qu'une idée sans horaire.
  // La contrainte ne s'applique donc que lorsque les deux sont posées.
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
    throw new ApiError('invalid_period', 400, "La fin de l'activité doit suivre son début.", {
      field: 'endsAt',
    })
  }
}

// Charge la participation de l'appelant et exige qu'il ait accepté l'événement
// (conception §3.8). Un invité qui n'a pas répondu reçoit un code distinct du
// non-participant : l'interface peut alors lui proposer d'accepter.
async function loadAcceptedParticipant(userId: string, eventId: string) {
  const participant = await loadParticipant(userId, eventId)

  if (!canProposeActivity(participant.rsvp)) {
    throw new ApiError(
      'must_accept_first',
      403,
      "Acceptez d'abord l'événement pour participer à son programme.",
    )
  }

  return participant
}

export async function createActivity(userId: string, eventId: string, input: CreateActivityInput) {
  const participant = await loadAcceptedParticipant(userId, eventId)

  const startsAt = input.startsAt ?? null
  const endsAt = input.endsAt ?? null
  assertPeriod(startsAt, endsAt)

  // La position suit l'ordre de proposition. Le réordonnancement explicite arrive en M7.
  const position = await prisma.activity.count({ where: { eventId } })

  return prisma.activity.create({
    data: {
      eventId,
      title: input.title,
      kind: input.kind,
      address: input.address,
      startsAt,
      endsAt,
      position,
      proposedBy: participant.id,
    },
  })
}

// Consulter le programme est ouvert à **tout** participant, y compris celui qui n'a pas
// encore répondu : on peut vouloir savoir ce qui est prévu avant de se décider.
export async function listActivities(userId: string, eventId: string) {
  const viewer = await loadParticipant(userId, eventId)

  const activities = await prisma.activity.findMany({
    where: { eventId },
    orderBy: { position: 'asc' },
    include: {
      votes: true,
      proposer: { include: { user: true } },
    },
  })

  return activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    kind: activity.kind,
    address: activity.address,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
    position: activity.position,
    status: activity.status,
    proposedBy: {
      participantId: activity.proposedBy,
      name: activity.proposer.user.name,
    },
    tally: tally(activity.votes),
    myVote: activity.votes.find((vote) => vote.participantId === viewer.id)?.value ?? null,
  }))
}

// Charge une activité avec l'événement auquel elle appartient, ou lève 404.
async function loadActivity(activityId: string) {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } })

  if (activity === null) {
    throw new ApiError('activity_not_found', 404, 'Activité introuvable.')
  }

  return activity
}

async function tallyOf(activityId: string) {
  return tally(await prisma.activityVote.findMany({ where: { activityId } }))
}

export async function castVote(userId: string, activityId: string, value: VoteValue) {
  const activity = await loadActivity(activityId)
  const participant = await loadParticipant(userId, activity.eventId)

  if (!canVote(participant.rsvp)) {
    throw new ApiError(
      'must_accept_first',
      403,
      "Acceptez d'abord l'événement pour voter sur son programme.",
    )
  }

  // Le vote n'est ouvert que tant que l'activité est proposée (§3.3). Rouvrir le vote passe
  // par une décision de l'administrateur qui la ramène à `proposed`.
  if (activity.status !== 'proposed') {
    throw new ApiError('activity_already_decided', 409, 'Cette activité a déjà été tranchée.')
  }

  // Changer d'avis est explicitement prévu (§3.3) : le vote remplace le précédent au lieu
  // de s'y ajouter. La clé primaire (activity_id, participant_id) rend l'`upsert` atomique.
  await prisma.activityVote.upsert({
    where: { activityId_participantId: { activityId, participantId: participant.id } },
    create: { activityId, participantId: participant.id, value },
    update: { value },
  })

  const counts = await tallyOf(activityId)

  // L'exception de la conception §5.2 : ce message transporte son contenu au lieu d'un
  // simple `{ type, id }`. C'est l'événement le plus fréquent, son décompte est public pour
  // tous les participants, et c'est le compteur qui doit bouger en direct — le client n'a
  // donc rien à recharger.
  publish(activity.eventId, {
    type: 'activity.vote',
    activityId,
    for: counts.for,
    against: counts.against,
  })

  return counts
}

export async function decideActivity(
  userId: string,
  activityId: string,
  status: 'proposed' | 'accepted' | 'rejected',
) {
  const activity = await loadActivity(activityId)
  const participant = await loadParticipant(userId, activity.eventId)

  if (!canDecideActivity(participant.role)) {
    throw new ApiError('forbidden', 403, 'Seul un administrateur peut trancher une activité.')
  }

  // Sans échéance ni quorum, et sans être lié au décompte : l'administrateur peut retenir
  // une activité minoritaire — le vote informe la décision, il ne la contraint pas (§3.3).
  // Aucun état n'est absorbant : revenir à `proposed` rouvre le vote.
  const updated = await prisma.activity.update({ where: { id: activityId }, data: { status } })

  publish(activity.eventId, { type: 'activity.decided', id: activityId })

  return updated
}

export async function updateActivity(
  userId: string,
  activityId: string,
  input: UpdateActivityInput,
) {
  const activity = await loadActivity(activityId)
  const participant = await loadParticipant(userId, activity.eventId)

  // La matrice §3.8 ne tranche pas ce cas : retenu que le proposant corrige sa proposition
  // et qu'un administrateur puisse corriger celle d'un autre.
  const isProposer = activity.proposedBy === participant.id

  if (!isProposer && !canDecideActivity(participant.role)) {
    throw new ApiError(
      'forbidden',
      403,
      'Seuls le proposant et un administrateur peuvent modifier cette activité.',
    )
  }

  const startsAt = input.startsAt === undefined ? activity.startsAt : input.startsAt
  const endsAt = input.endsAt === undefined ? activity.endsAt : input.endsAt
  assertPeriod(startsAt, endsAt)

  const updated = await prisma.activity.update({
    where: { id: activityId },
    data: {
      title: input.title,
      kind: input.kind,
      address: input.address,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
  })

  publish(activity.eventId, { type: 'activity.updated', id: activityId })

  return updated
}

export { assertPeriod, loadAcceptedParticipant, loadActivity, tallyOf }
