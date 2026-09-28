import type { Prisma } from '../../generated/prisma/client.ts'

// Inscription d'office des membres d'un groupe à ses événements (spec « événements de
// groupe »). Deux écritures se croisent ici : créer un événement dans un groupe, et entrer
// dans un groupe. Chacune lit ce que l'autre écrit ; sans ordre imposé, une création et une
// arrivée simultanées s'ignoreraient mutuellement et le nouveau membre resterait dehors.
//
// Le verrou de ligne sur `groups` impose cet ordre : la seconde transaction attend la
// première, et ses lectures — des instructions nouvelles, en READ COMMITTED — la voient.

export async function lockGroup(tx: Prisma.TransactionClient, groupId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE
  `
  return rows.length > 0
}

// Inscrit `userId` aux événements du groupe **pas encore commencés**. Un participant
// existant — invité à titre individuel avant d'entrer dans le groupe, voire administrateur —
// garde son rôle et sa réponse : `skipDuplicates` s'appuie sur l'unicité `(event_id,
// user_id)`, et seules les lignes réellement créées reviennent.
export async function enrollInUpcomingEvents(
  tx: Prisma.TransactionClient,
  groupId: string,
  userId: string,
) {
  const upcoming = await tx.event.findMany({
    where: { groupId, startsAt: { gt: new Date() } },
    select: { id: true, title: true },
  })

  if (upcoming.length === 0) {
    return []
  }

  const created = await tx.eventParticipant.createManyAndReturn({
    data: upcoming.map((event) => ({
      eventId: event.id,
      userId,
      role: 'member' as const,
      rsvp: 'invited' as const,
    })),
    skipDuplicates: true,
    select: { id: true, eventId: true },
  })

  const titleOf = new Map(upcoming.map((event) => [event.id, event.title]))

  return created.map((row) => ({
    participantId: row.id,
    eventId: row.eventId,
    title: titleOf.get(row.eventId) ?? '',
  }))
}
