import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { hashInviteToken } from '../../lib/tokens.ts'

// Consommation d'un jeton d'invitation (conception §2.6, §3.2). Le jeton désigne soit un
// lien partageable (résolu par son hachage), soit une invitation nominative (résolue par
// son `id`, l'identité de l'appelant étant alors revérifiée).

type Accepter = { id: string; email: string }

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

async function acceptViaLink(
  accepter: Accepter,
  token: string,
): Promise<{ eventId: string } | null> {
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

  await joinEvent(accepter.id, link.targetId)
  return { eventId: link.targetId }
}

async function acceptViaInvitation(
  accepter: Accepter,
  token: string,
): Promise<{ eventId: string }> {
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

  await joinEvent(accepter.id, invitation.targetId)

  if (invitation.status === 'pending') {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'accepted' } })
  }

  return { eventId: invitation.targetId }
}

export async function acceptInvitation(
  accepter: Accepter,
  token: string,
): Promise<{ eventId: string }> {
  return (await acceptViaLink(accepter, token)) ?? (await acceptViaInvitation(accepter, token))
}
