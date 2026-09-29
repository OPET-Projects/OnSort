import { prisma } from '../db.ts'

// Un blocage, dans un sens ou dans l'autre, rend silencieux tout geste d'une personne vers
// l'autre — demande d'ami, invitation à une sortie ou à un groupe : même réponse, rien
// d'écrit, personne de notifié, aucun courriel. Le bloqué ne doit pas pouvoir déduire qu'il
// l'est.
export async function blockedEitherWay(first: string, second: string): Promise<boolean> {
  const count = await prisma.userBlock.count({
    where: {
      OR: [
        { blockerId: first, blockedId: second },
        { blockerId: second, blockedId: first },
      ],
    },
  })
  return count > 0
}
