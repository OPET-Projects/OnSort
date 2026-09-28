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
