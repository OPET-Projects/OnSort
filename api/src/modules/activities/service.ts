import { prisma } from '../../db.ts'
import { geocoder } from '../../lib/geocoder.ts'
import { ApiError } from '../../lib/http.ts'
import { notify } from '../../lib/notify.ts'
import {
  canDecideActivity,
  canManageEvent,
  canProposeActivity,
  canVote,
} from '../../lib/permissions.ts'
import { bestMatch } from '../../lib/places.ts'
import { publish } from '../../lib/sse.ts'
import { tally, type VoteValue } from '../../lib/vote.ts'
import { loadParticipant } from '../events/service.ts'
import type { CreateActivityInput, UpdateActivityInput } from './schema.ts'

// Règles métier des activités (conception §2.7, §3.3). Ce fichier ne connaît pas Hono : il
// reçoit l'identifiant de l'appelant en argument et lève des `ApiError`.

// Destinataires d'une notification d'activité : les participants **ayant accepté**, sauf
// l'auteur de l'action. Notifier quelqu'un de ce qu'il vient de faire lui-même est le
// défaut le plus facile à introduire ici, et le plus agaçant à l'usage.
async function acceptedAudience(eventId: string, exceptUserId: string): Promise<string[]> {
  const participants = await prisma.eventParticipant.findMany({
    where: { eventId, rsvp: 'accepted' },
    select: { userId: true },
  })

  return participants.map((p) => p.userId).filter((userId) => userId !== exceptUserId)
}

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

// Coordonnées d'une adresse, ou `null` si elle est vide, introuvable, ou si le service ne
// répond pas.
//
// **Un échec de géocodage n'échoue jamais l'enregistrement.** La BAN peut être lente,
// indisponible, ou ne rien trouver ; perdre une saisie pour un service tiers serait le pire
// des échanges. Une activité sans coordonnées est valide, elle n'apparaît simplement pas sur
// la carte.
async function locate(address: string): Promise<{ lat: number | null; lng: number | null }> {
  if (address.trim() === '') {
    return { lat: null, lng: null }
  }

  try {
    const match = bestMatch(await geocoder.search(address))

    return match === null ? { lat: null, lng: null } : { lat: match.lat, lng: match.lng }
  } catch (error) {
    console.warn(`Géocodage de « ${address} » abandonné :`, error)
    return { lat: null, lng: null }
  }
}

export async function createActivity(userId: string, eventId: string, input: CreateActivityInput) {
  const participant = await loadAcceptedParticipant(userId, eventId)

  const startsAt = input.startsAt ?? null
  const endsAt = input.endsAt ?? null
  assertPeriod(startsAt, endsAt)

  // La position suit l'ordre de proposition. Le réordonnancement explicite arrive en M7.
  const position = await prisma.activity.count({ where: { eventId } })
  const { lat, lng } = await locate(input.address)

  const activity = await prisma.activity.create({
    data: {
      eventId,
      title: input.title,
      kind: input.kind,
      address: input.address,
      lat,
      lng,
      startsAt,
      endsAt,
      position,
      proposedBy: participant.id,
    },
  })

  publish(eventId, { type: 'activity.created', id: activity.id })

  // « La notification tu dois voter » (§2.9). Elle ne part que vers ceux qui ont accepté :
  // les autres ne peuvent pas voter, la leur envoyer serait du bruit.
  await notify({
    userIds: await acceptedAudience(eventId, userId),
    type: 'activity.proposed',
    eventId,
    payload: { title: activity.title },
  })

  return activity
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
    lat: activity.lat,
    lng: activity.lng,
    position: activity.position,
    status: activity.status,
    // Une activité annulée **reste dans le programme** (§3.7) : la retirer de la liste
    // reviendrait à la supprimer aux yeux de l'utilisateur, ce que la conception refuse.
    cancelledAt: activity.cancelledAt,
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

  // Le vote d'une activité annulée est clos : elle n'attend plus l'avis de personne. Le
  // rétablissement le rouvre — rien n'est perdu.
  if (activity.cancelledAt !== null) {
    throw new ApiError('activity_cancelled', 409, 'Cette activité est annulée.')
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

  await notify({
    userIds: await acceptedAudience(activity.eventId, userId),
    type: 'activity.decided',
    eventId: activity.eventId,
    payload: { title: updated.title, status },
  })

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

  // Changer `attendance_mode` est une prérogative d'administrateur (§3.8), là où corriger
  // le titre reste ouvert au proposant : les deux passent par la même route, pas par la
  // même permission.
  if (input.attendanceMode !== undefined && !canManageEvent(participant.role)) {
    throw new ApiError(
      'forbidden',
      403,
      "Seul un administrateur peut changer le mode de présence d'une activité.",
    )
  }

  const startsAt = input.startsAt === undefined ? activity.startsAt : input.startsAt
  const endsAt = input.endsAt === undefined ? activity.endsAt : input.endsAt
  assertPeriod(startsAt, endsAt)

  // Le géocodage ne se relance **que** si l'adresse a changé : sans cette garde, corriger un
  // titre appellerait un service public à chaque frappe. Effacer l'adresse efface les
  // coordonnées, faute de quoi un pin resterait au dernier lieu connu d'une activité qui
  // n'en a plus.
  const addressChanged = input.address !== undefined && input.address !== activity.address
  const located = addressChanged ? await locate(input.address ?? '') : null

  const updated = await prisma.activity.update({
    where: { id: activityId },
    data: {
      title: input.title,
      kind: input.kind,
      address: input.address,
      lat: located?.lat,
      lng: located?.lng,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      attendanceMode: input.attendanceMode,
    },
  })

  publish(activity.eventId, { type: 'activity.updated', id: activityId })

  return updated
}

// Réordonnancement du programme (§5.1). **Réservé à l'administrateur** : §3.8 lui attribue
// « trancher le vote » et « clore l'événement », et l'ordre du programme relève de la même
// catégorie — il engage le groupe, pas une proposition personnelle.
export async function reorderActivities(
  userId: string,
  eventId: string,
  activityIds: readonly string[],
) {
  const participant = await loadParticipant(userId, eventId)

  if (!canManageEvent(participant.role)) {
    throw new ApiError('forbidden', 403, 'Seul un administrateur peut réordonner le programme.')
  }

  const existing = await prisma.activity.findMany({ where: { eventId }, select: { id: true } })
  const requested = new Set(activityIds)

  // Un doublon donnerait deux positions à une activité et en priverait une autre : la liste
  // cesserait de décrire un ordre.
  if (requested.size !== activityIds.length) {
    throw new ApiError('invalid_order', 400, 'Une activité figure deux fois dans cet ordre.')
  }

  // La liste doit contenir **exactement** les activités de l'événement. Une liste partielle
  // laisserait les absentes à une position arbitraire, et une activité étrangère changerait
  // l'ordre d'un autre programme.
  const complete =
    requested.size === existing.length && existing.every((activity) => requested.has(activity.id))

  if (!complete) {
    throw new ApiError(
      'invalid_order',
      400,
      "L'ordre doit nommer exactement les activités de cet événement.",
      { expected: existing.length, received: requested.size },
    )
  }

  // Transaction : à mi-chemin, deux activités partageraient la même position et le programme
  // aurait deux troisièmes places.
  await prisma.$transaction(
    activityIds.map((id, position) =>
      prisma.activity.update({ where: { id }, data: { position } }),
    ),
  )

  // **Une seule diffusion** pour le geste entier : une par activité déplacée ferait recharger
  // le programme autant de fois. L'identifiant porté est celui de l'événement — c'est le
  // programme qui a changé, pas une activité.
  publish(eventId, { type: 'activity.updated', id: eventId })

  return { activityIds: [...activityIds] }
}

// Annulation d'une activité (§3.7) : `cancelled_at` est renseigné, **sans suppression
// physique**. Les votes restent, les dépenses aussi — « un acompte non remboursable
// existe ». Les soldes étant calculés par événement et non par activité, il n'y a rien à
// leur faire, et c'est précisément le point à ne pas « corriger ».
//
// **Réservé à l'administrateur**, pour la même raison que le réordonnancement : annuler
// engage le groupe. Et l'annulation **se rétablit** : annuler par erreur ne doit pas être
// définitif, aucun état de cette application n'étant absorbant.
export async function cancelActivity(userId: string, activityId: string, cancelled: boolean) {
  const activity = await loadActivity(activityId)
  const participant = await loadParticipant(userId, activity.eventId)

  if (!canManageEvent(participant.role)) {
    throw new ApiError('forbidden', 403, 'Seul un administrateur peut annuler une activité.')
  }

  const updated = await prisma.activity.update({
    where: { id: activityId },
    data: { cancelledAt: cancelled ? new Date() : null },
  })

  publish(activity.eventId, { type: 'activity.cancelled', id: activityId })

  await notify({
    userIds: await acceptedAudience(activity.eventId, userId),
    type: 'activity.cancelled',
    eventId: activity.eventId,
    payload: { title: updated.title, cancelled },
  })

  return updated
}

// Présence à une activité (§3.4). **L'absence est la ligne, la présence est l'absence de
// ligne** : les présents sont les participants ayant accepté, moins ceux inscrits dans
// `activity_absences`.
export async function setAttendance(userId: string, activityId: string, present: boolean) {
  const activity = await loadActivity(activityId)
  const participant = await loadAcceptedParticipant(userId, activity.eventId)

  // En mode `all`, l'absence n'aurait aucun effet sur le partage d'une dépense : l'accepter
  // en silence laisserait croire le contraire.
  if (activity.attendanceMode === 'all' && !present) {
    throw new ApiError(
      'attendance_not_optional',
      409,
      "La présence à cette activité n'est pas optionnelle.",
      { attendanceMode: activity.attendanceMode },
    )
  }

  // `deleteMany` et `upsert` plutôt que `delete` et `create` : se déclarer deux fois absent,
  // ou présent sans l'avoir jamais quittée, est une situation normale — deux clics sur un
  // réseau lent — et non une faute à signaler.
  if (present) {
    await prisma.activityAbsence.deleteMany({
      where: { activityId, participantId: participant.id },
    })
  } else {
    await prisma.activityAbsence.upsert({
      where: { activityId_participantId: { activityId, participantId: participant.id } },
      create: { activityId, participantId: participant.id },
      update: {},
    })
  }

  publish(activity.eventId, { type: 'activity.updated', id: activityId })

  return { present }
}

// Liste des présents. Elle **pré-remplit** le formulaire de dépense sans le piloter (§3.4) :
// la dépense fige ensuite ses propres parts.
export async function listPresent(userId: string, activityId: string) {
  const activity = await loadActivity(activityId)
  await loadParticipant(userId, activity.eventId)

  const accepted = await prisma.eventParticipant.findMany({
    where: { eventId: activity.eventId, rsvp: 'accepted' },
    include: { user: true },
    orderBy: { joinedAt: 'asc' },
  })

  if (activity.attendanceMode === 'all') {
    return accepted.map(toPresent)
  }

  const absent = new Set(
    (
      await prisma.activityAbsence.findMany({
        where: { activityId },
        select: { participantId: true },
      })
    ).map((row) => row.participantId),
  )

  return accepted.filter((participant) => !absent.has(participant.id)).map(toPresent)
}

function toPresent(participant: { id: string; user: { name: string } }) {
  return { participantId: participant.id, name: participant.user.name }
}

export { assertPeriod, loadAcceptedParticipant, loadActivity, tallyOf }
