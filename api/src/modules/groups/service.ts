import { config } from '../../config.ts'
import { prisma } from '../../db.ts'
import type { Prisma } from '../../generated/prisma/client.ts'
import { freeSlots } from '../../lib/calendar.ts'
import { renderEmail } from '../../lib/email.ts'
import { ApiError } from '../../lib/http.ts'
import { mailer } from '../../lib/mailer.ts'
import { notify } from '../../lib/notify.ts'
import { canManageGroup, type GroupRole } from '../../lib/permissions.ts'
import { lockGroup } from './enrollment.ts'
import type {
  CalendarWindowInput,
  CreateGroupInput,
  InviteMemberInput,
  MemberRoleInput,
} from './schema.ts'

// Règles métier des groupes (conception §2.3, §2.4). Ce fichier ne connaît pas Hono : il
// reçoit l'identifiant de l'appelant en argument et lève des `ApiError`.

const MAXIMUM_WINDOW_DAYS = 90

export async function createGroup(userId: string, input: CreateGroupInput) {
  // Le créateur est d'emblée administrateur, comme pour un événement (§3.2).
  return prisma.group.create({
    data: {
      name: input.name,
      createdBy: userId,
      members: { create: { userId, role: 'admin' } },
    },
  })
}

export async function listGroups(userId: string) {
  const rows = await prisma.groupMember.findMany({
    where: { userId },
    include: { group: { include: { _count: { select: { members: true } } } } },
    orderBy: { joinedAt: 'asc' },
  })

  return rows.map((row) => ({
    id: row.group.id,
    name: row.group.name,
    role: row.role,
    memberCount: row.group._count.members,
  }))
}

// Charge l'adhésion de l'appelant, ou lève : 404 si le groupe n'existe pas, 403 s'il existe
// mais que l'appelant n'en est pas membre. Même forme que `loadParticipant` pour un
// événement.
export async function loadMembership(userId: string, groupId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })

  if (membership === null) {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } })

    if (group === null) {
      throw new ApiError('group_not_found', 404, 'Groupe introuvable.')
    }

    throw new ApiError('not_a_member', 403, 'Vous ne faites pas partie de ce groupe.')
  }

  return membership
}

export async function getGroup(userId: string, groupId: string) {
  const membership = await loadMembership(userId, groupId)

  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: { include: { user: true }, orderBy: { joinedAt: 'asc' } } },
  })

  // Pas de pagination : le volume d'un groupe d'amis ne la justifie pas. Choix non mesuré,
  // consigné comme tel au journal.
  const events = await prisma.event.findMany({
    where: { groupId },
    orderBy: { startsAt: 'asc' },
    include: { participants: { where: { userId }, select: { rsvp: true } } },
  })

  return {
    id: group.id,
    name: group.name,
    createdBy: group.createdBy,
    members: group.members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
    // `rsvp` nul : l'appelant voit la sortie sans y participer — arrivé dans le groupe
    // après qu'elle a commencé.
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: event.status,
      rsvp: event.participants[0]?.rsvp ?? null,
    })),
    viewer: { userId, role: membership.role },
  }
}

// Verrouille le groupe **puis** lit l'adhésion de l'appelant. Dans l'autre ordre, un admin
// rétrogradé ou retiré entre la lecture et le verrou agirait encore avec ses anciens droits.
async function lockMembership(tx: Prisma.TransactionClient, userId: string, groupId: string) {
  if (!(await lockGroup(tx, groupId))) {
    throw new ApiError('group_not_found', 404, 'Groupe introuvable.')
  }

  const membership = await tx.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })

  if (membership === null) {
    throw new ApiError('not_a_member', 403, 'Vous ne faites pas partie de ce groupe.')
  }

  return membership
}

function assertAdmin(role: GroupRole, message: string): void {
  if (!canManageGroup(role)) {
    throw new ApiError('forbidden', 403, message)
  }
}

export async function renameGroup(userId: string, groupId: string, input: CreateGroupInput) {
  await prisma.$transaction(async (tx) => {
    const membership = await lockMembership(tx, userId, groupId)
    assertAdmin(membership.role, 'Seul un administrateur du groupe peut le renommer.')
    await tx.group.update({ where: { id: groupId }, data: { name: input.name } })
  })
  return { ok: true as const }
}

// Sous verrou : deux admins qui se rétrogradent l'un l'autre au même instant liraient
// chacun « il reste un autre admin », et le groupe finirait sans aucun.
export async function setMemberRole(
  userId: string,
  groupId: string,
  targetId: string,
  input: MemberRoleInput,
) {
  await prisma.$transaction(async (tx) => {
    const membership = await lockMembership(tx, userId, groupId)
    assertAdmin(membership.role, 'Seul un administrateur du groupe peut changer un rôle.')

    const target = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetId } },
    })

    if (target === null) {
      throw new ApiError('member_not_found', 404, "Cette personne n'est pas membre du groupe.")
    }

    if (target.role === 'admin' && input.role === 'member') {
      const admins = await tx.groupMember.count({ where: { groupId, role: 'admin' } })

      if (admins === 1) {
        throw new ApiError('last_admin', 409, 'Le groupe doit garder au moins un administrateur.')
      }
    }

    await tx.groupMember.update({
      where: { groupId_userId: { groupId, userId: targetId } },
      data: { role: input.role },
    })
  })

  return { ok: true as const }
}

// Quitter et retirer sont un même geste vu de deux côtés (spec « membres et amis »). Sous
// verrou : deux admins qui partent ensemble liraient chacun « il reste un admin ».
//
// Aucun état absorbant (§3.1) : un groupe sans admin ne se gère plus, un groupe sans
// membre ne se voit plus. Le premier promeut le plus ancien, le second disparaît — ses
// sorties restent, détachées (`ON DELETE SET NULL`).
export async function removeMember(userId: string, groupId: string, targetId: string) {
  return prisma.$transaction(async (tx) => {
    const membership = await lockMembership(tx, userId, groupId)

    if (targetId !== userId) {
      assertAdmin(membership.role, 'Seul un administrateur du groupe peut retirer un membre.')
    }

    const removed = await tx.groupMember.deleteMany({ where: { groupId, userId: targetId } })

    if (removed.count === 0) {
      throw new ApiError('member_not_found', 404, "Cette personne n'est pas membre du groupe.")
    }

    const remaining = await tx.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: 'asc' },
    })

    const [oldest] = remaining

    if (oldest === undefined) {
      await tx.group.delete({ where: { id: groupId } })
      return { groupDeleted: true }
    }

    if (!remaining.some((member) => member.role === 'admin')) {
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId: oldest.userId } },
        data: { role: 'admin' },
      })
    }

    return { groupDeleted: false }
  })
}

function inviteUrl(token: string): string {
  return `${config.appUrl}/invite/${token}`
}

// §5.1 écrit `POST /groups/:id/members`, ce qui se lirait « insère cette personne ».
// L'insertion directe serait un **oracle d'énumération** : la réponse dirait si l'adresse a
// un compte. On crée donc une invitation, exactement comme pour un événement, et la réponse
// est identique dans tous les cas (§4). On ne rejoint jamais un groupe sans l'avoir accepté.
export async function inviteToGroup(userId: string, groupId: string, input: InviteMemberInput) {
  const membership = await loadMembership(userId, groupId)

  if (!canManageGroup(membership.role)) {
    throw new ApiError('forbidden', 403, 'Seul un administrateur du groupe peut inviter.')
  }

  // Correspondance stricte sur l'adresse, jamais partielle (§4).
  const invited = await prisma.user.findUnique({ where: { email: input.email } })

  const invitation = await prisma.invitation.create({
    data: {
      scope: 'group',
      targetId: groupId,
      invitedUserId: invited?.id ?? null,
      invitedEmail: invited === null ? input.email : null,
      invitedBy: userId,
    },
  })

  const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } })

  // Notification interne en plus du courriel quand le compte existe (§4). La réponse reste
  // la même dans les deux cas : rien de tout cela n'est observable de l'extérieur.
  await notify({
    userIds: invited === null ? [] : [invited.id],
    type: 'group.invited',
    payload: { name: group.name },
  })

  // Un échec d'envoi est journalisé et n'interrompt pas l'invitation, ni ne révèle l'état du
  // compte visé.
  await mailer
    .send({
      to: input.email,
      subject: `Invitation à rejoindre « ${group.name} » sur On Sort ?`,
      ...renderEmail({
        heading: `Rejoignez le groupe « ${group.name} »`,
        paragraphs: [
          `Vous êtes invité·e à rejoindre le groupe « ${group.name} ». Ouvrez ce lien pour répondre :`,
        ],
        action: { label: 'Répondre à l’invitation', url: inviteUrl(invitation.id) },
        note: "Si vous n'attendiez pas cette invitation, ignorez ce message.",
      }),
    })
    .catch((error: unknown) => {
      console.error(`Envoi de l'invitation de groupe ${invitation.id} échoué :`, error)
    })

  return { status: 'sent' as const }
}

// Calendrier partagé : la superposition des indisponibilités des membres sur une fenêtre
// (§2.4). **Vue calculée, jamais une table** — la matérialiser serait un cache qu'aucune
// mesure ne justifie, et une source de vérité de plus à tenir à jour.
export async function getGroupCalendar(
  userId: string,
  groupId: string,
  window: CalendarWindowInput,
) {
  const membership = await loadMembership(userId, groupId)

  if (window.to <= window.from) {
    throw new ApiError('invalid_period', 400, 'La fin de la fenêtre doit suivre son début.', {
      field: 'to',
    })
  }

  // Sans borne, un appel sur dix ans lirait toute la table.
  if (window.to.getTime() - window.from.getTime() > MAXIMUM_WINDOW_DAYS * 86_400_000) {
    throw new ApiError('window_too_wide', 400, 'La fenêtre ne peut dépasser 90 jours.', {
      maximumDays: MAXIMUM_WINDOW_DAYS,
    })
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true },
    orderBy: { joinedAt: 'asc' },
  })

  const rows = await prisma.unavailability.findMany({
    where: {
      userId: { in: members.map((member) => member.userId) },
      // Chevauchement en bornes semi-ouvertes (§2.4).
      startsAt: { lt: window.to },
      endsAt: { gt: window.from },
    },
    orderBy: { startsAt: 'asc' },
  })

  const nameOf = new Map(members.map((member) => [member.userId, member.user.name]))

  return {
    from: window.from,
    to: window.to,
    // `label` est **privé** (§2.4) : le groupe voit « occupé », jamais la raison. Il n'est
    // pas seulement omis à l'affichage — il ne quitte jamais cette fonction.
    busy: rows.map((row) => ({
      userId: row.userId,
      name: nameOf.get(row.userId) ?? 'Membre retiré',
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    })),
    free: freeSlots({ startsAt: window.from, endsAt: window.to }, rows, window.minimumMinutes),
    viewer: { role: membership.role },
  }
}
