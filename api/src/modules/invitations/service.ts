import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { hashInviteToken } from '../../lib/tokens.ts'

// Consommation d'un jeton d'invitation (conception §2.6, §3.2). Le jeton désigne soit un
// lien partageable (résolu par son hachage), soit une invitation nominative (résolue par
// son `id`, l'identité de l'appelant étant alors revérifiée).

type Accepter = { id: string; email: string }

// Jeton résolu, sans effet de bord. La résolution est séparée de l'acceptation depuis que
// l'invité voit un aperçu avant de décider : les deux gestes partagent exactement les mêmes
// contrôles de validité, et un contrôle dupliqué finirait par diverger.
type Resolved = {
  eventId: string
  invitationId: string | null
}

async function joinEvent(userId: string, eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })

  if (event === null) {
    throw new ApiError('event_not_found', 404, 'Événement introuvable.')
  }

  // Rejoindre est idempotent : un lien peut être ouvert deux fois, et deux ouvertures
  // simultanées sont un double-clic ordinaire. Une lecture suivie d'une écriture laisserait
  // entre les deux une fenêtre où les deux appels se croient absents ; la seconde insertion
  // heurterait alors la contrainte d'unicité et l'appelant recevrait un 500. Un `upsert`
  // s'appuie sur cette même contrainte pour trancher en une seule instruction.
  //
  // `update: {}` est délibérément vide : une nouvelle acceptation ne doit ni rétrograder un
  // administrateur en simple participant, ni effacer une réponse déjà donnée.
  await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, role: 'member', rsvp: 'invited' },
    update: {},
  })
}

async function resolveViaLink(token: string): Promise<Resolved | null> {
  const link = await prisma.inviteLink.findUnique({
    where: { tokenHash: hashInviteToken(token) },
  })

  if (link === null || link.scope !== 'event') {
    return null
  }

  if (link.revokedAt !== null) {
    throw new ApiError('invitation_link_revoked', 410, "Ce lien d'invitation a été révoqué.")
  }

  if (link.expiresAt !== null && link.expiresAt.getTime() <= Date.now()) {
    throw new ApiError('invitation_link_expired', 410, "Ce lien d'invitation a expiré.")
  }

  return { eventId: link.targetId, invitationId: null }
}

async function resolveViaInvitation(accepter: Accepter, token: string): Promise<Resolved> {
  const invitation = await prisma.invitation.findUnique({ where: { id: token } })

  if (invitation === null || invitation.scope !== 'event') {
    throw new ApiError(
      'invitation_not_found',
      404,
      "Cette invitation n'existe pas ou n'est plus valide.",
    )
  }

  const isRecipient =
    (invitation.invitedUserId !== null && invitation.invitedUserId === accepter.id) ||
    (invitation.invitedEmail !== null && invitation.invitedEmail === accepter.email)

  if (!isRecipient) {
    throw new ApiError('invitation_not_yours', 403, 'Cette invitation ne vous est pas adressée.')
  }

  if (invitation.status === 'declined') {
    throw new ApiError('invitation_not_found', 404, "Cette invitation n'est plus valide.")
  }

  return { eventId: invitation.targetId, invitationId: invitation.id }
}

async function resolveInvitation(accepter: Accepter, token: string): Promise<Resolved> {
  return (await resolveViaLink(token)) ?? (await resolveViaInvitation(accepter, token))
}

// Aperçu montré derrière la popup « rejoindre ou non ». Volontairement pauvre : un lien
// partageable circule sans contrôle, et son porteur n'est pas encore un participant. Ni la
// liste des participants — qui porterait leurs adresses — ni le programme, ni les dépenses
// ne franchissent cette route ; seul de quoi reconnaître l'événement auquel on dit oui.
export async function previewInvitation(accepter: Accepter, token: string) {
  const { eventId } = await resolveInvitation(accepter, token)

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      creator: { select: { name: true } },
      _count: { select: { participants: true } },
    },
  })

  if (event === null) {
    throw new ApiError('event_not_found', 404, 'Événement introuvable.')
  }

  // Rouvrir son propre lien une fois entré ne doit pas reposer la question : le front saute
  // alors la popup et ouvre l'événement.
  const membership = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId: accepter.id } },
    select: { id: true },
  })

  return {
    eventId: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    organiser: event.creator.name,
    participantCount: event._count.participants,
    alreadyMember: membership !== null,
  }
}

export async function acceptInvitation(
  accepter: Accepter,
  token: string,
): Promise<{ eventId: string }> {
  const { eventId, invitationId } = await resolveInvitation(accepter, token)

  await joinEvent(accepter.id, eventId)

  // Une invitation nominative passe à `accepted` ; un lien partageable n'a pas de statut.
  // Refuser, lui, n'écrit rien : l'invité qui répond « non merci » garde son lien utilisable,
  // car aucun état de cette application n'a le droit d'être un cul-de-sac.
  if (invitationId !== null) {
    await prisma.invitation.updateMany({
      where: { id: invitationId, status: 'pending' },
      data: { status: 'accepted' },
    })
  }

  return { eventId }
}
