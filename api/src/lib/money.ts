// Arithmétique du partage des dépenses (conception §3.5). Fonctions pures, sans
// entrées-sorties : c'est là que porte l'effort de test, comme `lib/vote.ts`.
//
// **Tout est en centimes entiers.** Aucun flottant n'apparaît ici : un centime perdu dans un
// arrondi se retrouve dans un solde qui ne tombe jamais à zéro, et le groupe ne peut plus
// clore ses comptes.

export type Share = {
  participantId: string
  amountCents: number
}

function assertWholeCents(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error(`Montant en centimes entiers attendu, reçu ${amountCents}.`)
  }
}

// Division en centimes entiers. Le reste est réparti de façon déterministe : les `reste`
// premiers participants, **triés par identifiant**, reçoivent un centime supplémentaire
// (§3.5).
//
// Le tri est ce qui rend le résultat reproductible. Sans lui, deux calculs sur la même
// dépense attribueraient le centime supplémentaire à des personnes différentes selon
// l'ordre de lecture en base — et la part figée dépendrait du hasard.
export function splitEqually(amountCents: number, participantIds: readonly string[]): Share[] {
  assertWholeCents(amountCents)

  if (participantIds.length === 0) {
    throw new Error('Une dépense doit être partagée entre au moins un participant.')
  }

  const sorted = [...participantIds].sort()
  const base = Math.trunc(amountCents / sorted.length)
  const remainder = amountCents - base * sorted.length

  return sorted.map((participantId, index) => ({
    participantId,
    amountCents: base + (index < remainder ? 1 : 0),
  }))
}
