import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { canProposeActivity } from '../../lib/permissions.ts'
import { tally } from '../../lib/vote.ts'
import { loadParticipant } from '../events/service.ts'
import type { CreateActivityInput } from './schema.ts'

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

export { assertPeriod, loadAcceptedParticipant }
