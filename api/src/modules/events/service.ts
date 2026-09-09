import { config } from '../../config.ts'
import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { mailer } from '../../lib/mailer.ts'
import { canManageEvent } from '../../lib/permissions.ts'
import { publish } from '../../lib/sse.ts'
import { generateInviteToken, hashInviteToken } from '../../lib/tokens.ts'
import type { CreateEventInput, InviteInput, UpdateEventInput } from './schema.ts'

// Règles métier des événements (conception §2.5, §3.1, §3.2). Ce fichier ne connaît pas
// Hono : il reçoit l'identifiant de l'appelant en argument et lève des `ApiError`.

function assertPeriod(startsAt: Date, endsAt: Date): void {
  if (endsAt <= startsAt) {
    throw new ApiError('invalid_period', 400, "La fin de l'événement doit suivre son début.", {
      field: 'endsAt',
    })
  }
}

export async function createEvent(userId: string, input: CreateEventInput) {
  assertPeriod(input.startsAt, input.endsAt)

  // Le créateur est d'emblée administrateur et présent (conception §3.2).
  return prisma.event.create({
    data: {
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdBy: userId,
      participants: { create: { userId, role: 'admin', rsvp: 'accepted' } },
    },
  })
}

export async function listEvents(userId: string) {
  const rows = await prisma.eventParticipant.findMany({
    where: { userId },
    include: { event: true },
    orderBy: { event: { startsAt: 'asc' } },
  })

  return rows.map((row) => ({
    id: row.event.id,
    title: row.event.title,
    startsAt: row.event.startsAt,
    endsAt: row.event.endsAt,
    status: row.event.status,
    role: row.role,
    rsvp: row.rsvp,
  }))
}

export async function getEvent(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
    },
  })

  if (event === null) {
    throw new ApiError('event_not_found', 404, 'Événement introuvable.')
  }

  const viewer = event.participants.find((participant) => participant.userId === userId)

  if (viewer === undefined) {
    throw new ApiError('not_a_participant', 403, 'Vous ne participez pas à cet événement.')
  }

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    createdBy: event.createdBy,
    participants: event.participants.map((participant) => ({
      userId: participant.userId,
      name: participant.user.name,
      email: participant.user.email,
      role: participant.role,
      rsvp: participant.rsvp,
      joinedAt: participant.joinedAt,
    })),
    // `participantId` accompagne le rôle depuis M3 : soldes, virements et règlements sont
    // tous indexés par participation, et l'interface doit savoir laquelle est la sienne
    // pour n'offrir que les gestes qui lui reviennent.
    viewer: { participantId: viewer.id, role: viewer.role, rsvp: viewer.rsvp },
  }
}

export async function updateEvent(userId: string, eventId: string, input: UpdateEventInput) {
  await assertCanManage(userId, eventId)

  const current = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const startsAt = input.startsAt ?? current.startsAt
  const endsAt = input.endsAt ?? current.endsAt
  assertPeriod(startsAt, endsAt)

  // Aucun état n'est absorbant (conception §3.1) : tout `status` valide est accepté depuis
  // n'importe quel état, y compris un retour en arrière.
  return prisma.event.update({
    where: { id: eventId },
    data: {
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
    },
  })
}

async function assertCanManage(userId: string, eventId: string): Promise<void> {
  const participant = await loadParticipant(userId, eventId)

  if (!canManageEvent(participant.role)) {
    throw new ApiError('forbidden', 403, "Seul un administrateur peut administrer l'événement.")
  }
}

function inviteUrl(token: string): string {
  return `${config.appUrl}/invite/${token}`
}

// Émet une invitation, par lien partageable ou par adresse e-mail (conception §2.6).
// Sur l'adresse e-mail, la réponse est identique que le compte existe ou non
// (anti-énumération, conception §4).
export async function createInvitation(userId: string, eventId: string, input: InviteInput) {
  await assertCanManage(userId, eventId)

  if (input.kind === 'link') {
    const token = generateInviteToken()
    const expiresAt =
      input.expiresInHours === undefined
        ? null
        : new Date(Date.now() + input.expiresInHours * 3_600_000)

    await prisma.inviteLink.create({
      data: {
        scope: 'event',
        targetId: eventId,
        tokenHash: hashInviteToken(token),
        expiresAt,
        createdBy: userId,
      },
    })

    return { url: inviteUrl(token) }
  }

  // Correspondance stricte sur l'adresse, jamais partielle (conception §4).
  const invited = await prisma.user.findUnique({ where: { email: input.email } })

  const invitation = await prisma.invitation.create({
    data: {
      scope: 'event',
      targetId: eventId,
      invitedUserId: invited?.id ?? null,
      invitedEmail: invited === null ? input.email : null,
      invitedBy: userId,
    },
  })

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })

  // Envoi depuis le handler, comme le lien magique de M0 ; la file d'attente reste une
  // recommandation retirée (decisions-techniques §6). Un échec d'envoi est journalisé et
  // n'interrompt pas l'invitation, ni ne révèle l'état du compte visé.
  await mailer
    .send({
      to: input.email,
      subject: `Invitation à « ${event.title} » sur On Sort ?`,
      text: [
        'Bonjour,',
        '',
        `Vous êtes invité·e à rejoindre « ${event.title} ». Ouvrez ce lien pour répondre :`,
        inviteUrl(invitation.id),
        '',
        "Si vous n'attendiez pas cette invitation, ignorez ce message.",
      ].join('\n'),
    })
    .catch((error: unknown) => {
      console.error(`Envoi de l'invitation ${invitation.id} échoué :`, error)
    })

  return { status: 'sent' as const }
}

export async function setRsvp(userId: string, eventId: string, rsvp: 'accepted' | 'declined') {
  const participant = await loadParticipant(userId, eventId)

  // Un participant qui décline conserve sa ligne (conception §3.2) : mise à jour, jamais
  // suppression.
  await prisma.eventParticipant.update({
    where: { eventId_userId: { eventId, userId } },
    data: { rsvp },
  })

  // Le message ne porte que `{ type, id }` : le client recharge la ressource concernée
  // (conception §5.2). Une réponse change aussi qui peut proposer et voter, ce que les
  // autres écrans doivent refléter sans rechargement manuel.
  publish(eventId, { type: 'participant.rsvp', id: participant.id })
}

// Charge la ligne de participation de l'appelant, ou lève : 404 si l'événement n'existe
// pas, 403 s'il existe mais que l'appelant n'y participe pas. Réutilisé par la mise à jour,
// le RSVP et l'invitation.
export async function loadParticipant(userId: string, eventId: string) {
  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
  })

  if (participant === null) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })

    if (event === null) {
      throw new ApiError('event_not_found', 404, 'Événement introuvable.')
    }

    throw new ApiError('not_a_participant', 403, 'Vous ne participez pas à cet événement.')
  }

  return participant
}

export { assertPeriod }
