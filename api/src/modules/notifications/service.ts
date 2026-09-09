import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import type { FeedQueryInput } from './schema.ts'

// Lecture des notifications (conception §2.9).

export async function listNotifications(userId: string, query: FeedQueryInput) {
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      // Les plus récentes d'abord : une liste chronologique enterrerait ce qui vient
      // d'arriver sous ce qui a déjà été lu.
      //
      // L'identifiant départage : `created_at` a une résolution d'une milliseconde, et deux
      // notifications nées dans la même peuvent sinon changer de place entre deux
      // chargements — une liste qui se réordonne toute seule passe pour un bogue.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    }),
    // Compté sur l'ensemble, pas sur la page : la pastille doit dire combien il en reste,
    // pas combien la page en montre.
    prisma.notification.count({ where: { userId, readAt: null } }),
  ])

  return {
    notifications: notifications.map((row) => ({
      id: row.id,
      type: row.type,
      eventId: row.eventId,
      payload: row.payload,
      readAt: row.readAt,
      createdAt: row.createdAt,
    })),
    unread,
  }
}

// Marquer lue est **idempotent** : deux clics sur un réseau lent ne doivent pas produire
// d'erreur, et la première date fait foi.
//
// Marquer la notification d'un autre rend 404 et non 403 : « interdit » confirmerait qu'elle
// existe, et le flux de quelqu'un d'autre ne se devine pas.
export async function markNotificationRead(userId: string, notificationId: string) {
  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  })

  if (count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true },
    })

    if (exists === null) {
      throw new ApiError('notification_not_found', 404, 'Notification introuvable.')
    }
  }

  return { ok: true }
}
