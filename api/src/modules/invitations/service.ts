import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { hashInviteToken } from '../../lib/tokens.ts'
import type { RespondInput } from './schema.ts'

// Consommation d'un jeton d'invitation (conception §2.6, §3.2). Le jeton désigne soit un
// lien partageable (résolu par son hachage), soit une invitation nominative (résolue par
// son `id`, l'identité de l'appelant étant alors revérifiée).
//
// La cible est **polymorphe** : un événement ou un groupe. Le modèle l'était depuis sa
// première migration — `InviteScope.group` avait été déclaré en M1 « pour que le modèle soit
// complet dès sa première migration » ; M4 s'en sert enfin.

type Accepter = { id: string; email: string }

export type InviteScope = 'event' | 'group'

// Jeton résolu, sans effet de bord. La résolution est séparée de l'acceptation depuis que
// l'invité voit un aperçu avant de décider : les deux gestes partagent exactement les mêmes
// contrôles de validité, et un contrôle dupliqué finirait par diverger.
type Resolved = {
  scope: InviteScope
  targetId: string
  invitationId: string | null
}

async function joinEvent(
  userId: string,
  eventId: string,
  rsvp: RespondInput['rsvp'],
): Promise<void> {
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
  // **La réponse entre avec le participant.** L'invité vient de la donner dans la popup ;
  // la lui redemander dans l'onglet Participants ferait répondre deux fois à la même
  // question. Décliner fait entrer quand même : la ligne conserve la trace de la réponse et
  // son auteur peut revenir dessus (§3.2).
  //
  // `update: {}` est délibérément vide : une nouvelle ouverture du lien ne doit ni
  // rétrograder un administrateur en simple participant, ni écraser une réponse donnée
  // depuis. Le cas ne se présente pas depuis la popup, que `alreadyMember` court-circuite.
  await prisma.eventParticipant.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, role: 'member', rsvp },
    update: {},
  })
}

// Un groupe n'a pas de RSVP : on en est membre ou non. « Je ne sais pas » n'a donc pas de
// sens ici, et l'interface ne le propose pas pour une invitation de groupe.
async function joinGroup(userId: string, groupId: string): Promise<void> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } })

  if (group === null) {
    throw new ApiError('group_not_found', 404, 'Groupe introuvable.')
  }

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId, userId } },
    create: { groupId, userId, role: 'member' },
    update: {},
  })
}

async function resolveViaLink(token: string): Promise<Resolved | null> {
  const link = await prisma.inviteLink.findUnique({
    where: { tokenHash: hashInviteToken(token) },
  })

  if (link === null) {
    return null
  }

  if (link.revokedAt !== null) {
    throw new ApiError('invitation_link_revoked', 410, "Ce lien d'invitation a été révoqué.")
  }

  if (link.expiresAt !== null && link.expiresAt.getTime() <= Date.now()) {
    throw new ApiError('invitation_link_expired', 410, "Ce lien d'invitation a expiré.")
  }

  return { scope: link.scope, targetId: link.targetId, invitationId: null }
}

async function resolveViaInvitation(accepter: Accepter, token: string): Promise<Resolved> {
  const invitation = await prisma.invitation.findUnique({ where: { id: token } })

  if (invitation === null) {
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

  return { scope: invitation.scope, targetId: invitation.targetId, invitationId: invitation.id }
}

async function resolveInvitation(accepter: Accepter, token: string): Promise<Resolved> {
  return (await resolveViaLink(token)) ?? (await resolveViaInvitation(accepter, token))
}

// Aperçu montré derrière la popup « rejoindre ou non ». Volontairement pauvre : un lien
// partageable circule sans contrôle, et son porteur n'est pas encore un participant. Ni la
// liste des participants — qui porterait leurs adresses — ni le programme, ni les dépenses,
// ni le calendrier ne franchissent cette route ; seul de quoi reconnaître ce à quoi on dit oui.
export async function previewInvitation(accepter: Accepter, token: string) {
  const { scope, targetId } = await resolveInvitation(accepter, token)

  if (scope === 'group') {
    const group = await prisma.group.findUnique({
      where: { id: targetId },
      include: {
        creator: { select: { name: true } },
        _count: { select: { members: true } },
      },
    })

    if (group === null) {
      throw new ApiError('group_not_found', 404, 'Groupe introuvable.')
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: targetId, userId: accepter.id } },
      select: { userId: true },
    })

    return {
      scope,
      groupId: group.id,
      title: group.name,
      organiser: group.creator.name,
      participantCount: group._count.members,
      alreadyMember: membership !== null,
    }
  }

  const event = await prisma.event.findUnique({
    where: { id: targetId },
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
    where: { eventId_userId: { eventId: targetId, userId: accepter.id } },
    select: { id: true },
  })

  return {
    scope,
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
  rsvp: RespondInput['rsvp'] = 'accepted',
) {
  const { scope, targetId, invitationId } = await resolveInvitation(accepter, token)

  if (scope === 'group') {
    await joinGroup(accepter.id, targetId)
  } else {
    await joinEvent(accepter.id, targetId, rsvp)
  }

  // Une invitation nominative ne se clôt que sur un oui ; un lien partageable n'a pas de
  // statut. Sur « je ne sais pas » ou sur un refus elle reste ouverte, faute de quoi le
  // service la traiterait ensuite comme invalide et le destinataire ne pourrait plus jamais
  // la rouvrir : un cul-de-sac, que les règles du projet interdisent.
  if (invitationId !== null && rsvp === 'accepted') {
    await prisma.invitation.updateMany({
      where: { id: invitationId, status: 'pending' },
      data: { status: 'accepted' },
    })
  }

  return scope === 'group' ? { groupId: targetId } : { eventId: targetId }
}
