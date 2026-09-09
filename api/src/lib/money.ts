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

export type BalanceInput = {
  participantIds: readonly string[]
  expenses: readonly { paidBy: string; amountCents: number; shares: readonly Share[] }[]
  settlements: readonly {
    fromParticipantId: string
    toParticipantId: string
    amountCents: number
  }[]
}

export type Balance = {
  participantId: string
  balanceCents: number
}

// Solde d'un participant = montants avancés − parts dues + transferts reçus − transferts
// émis (§3.5). **Aucun solde n'est stocké** (§2.8 note 1) : cette fonction est la seule
// source, appelée à chaque lecture.
//
// Elle ne connaît pas la distinction déclaré / confirmé : le filtrage des règlements se
// fait en amont, dans la couche service, qui ne lui passe que les confirmés.
export function computeBalances(input: BalanceInput): Balance[] {
  const balanceOf = new Map<string, number>(input.participantIds.map((id) => [id, 0]))

  // Une part peut viser un participant absent de la liste — il a quitté l'événement depuis.
  // Sa part reste due : l'ignorer ferait disparaître des centimes et la somme des soldes
  // cesserait d'être nulle.
  const add = (participantId: string, delta: number): void => {
    balanceOf.set(participantId, (balanceOf.get(participantId) ?? 0) + delta)
  }

  for (const expense of input.expenses) {
    add(expense.paidBy, expense.amountCents)

    for (const share of expense.shares) {
      add(share.participantId, -share.amountCents)
    }
  }

  // Attention au signe. Le débiteur `from` **envoie** : son solde négatif remonte vers zéro,
  // donc `+`. Le créancier `to` **reçoit** : sa créance s'éteint, donc `−`. L'intuition
  // inverse est la faute classique du domaine.
  for (const settlement of input.settlements) {
    add(settlement.fromParticipantId, settlement.amountCents)
    add(settlement.toParticipantId, -settlement.amountCents)
  }

  return [...balanceOf.entries()]
    .map(([participantId, balanceCents]) => ({ participantId, balanceCents }))
    .sort((left, right) => left.participantId.localeCompare(right.participantId))
}

export type Transfer = {
  fromParticipantId: string
  toParticipantId: string
  amountCents: number
}

// Minimisation des virements (§3.5) : algorithme glouton appariant le plus gros créancier
// au plus gros débiteur. Le problème est théoriquement NP-difficile ; l'heuristique est
// optimale en pratique pour N ≤ 20, ce qui couvre largement une sortie entre amis.
//
// Elle rend **au plus N−1 virements** : chaque appariement porte au moins un des deux
// soldes à zéro, donc retire au moins une personne de la liste à chaque tour.
//
// Le départage par identifiant à solde égal n'est pas cosmétique : sans lui, deux
// chargements de la même page proposeraient des virements différents, et personne ne
// saurait lequel exécuter.
export function minimizeTransfers(balances: readonly Balance[]): Transfer[] {
  const creditors = balances
    .filter((balance) => balance.balanceCents > 0)
    .map((balance) => ({ ...balance }))
    .sort(byAmountThenId)

  const debtors = balances
    .filter((balance) => balance.balanceCents < 0)
    .map((balance) => ({
      participantId: balance.participantId,
      balanceCents: -balance.balanceCents,
    }))
    .sort(byAmountThenId)

  const transfers: Transfer[] = []

  // Les deux têtes de liste sont retirées puis remises si elles gardent un reste. Le
  // `undefined` d'une liste vide **est** la condition d'arrêt : la retirer au profit d'un
  // test de longueur obligerait à réaffirmer ensuite à TypeScript ce qu'il vient de vérifier.
  for (;;) {
    const creditor = creditors.shift()
    const debtor = debtors.shift()

    if (creditor === undefined || debtor === undefined) {
      break
    }

    const amountCents = Math.min(creditor.balanceCents, debtor.balanceCents)

    transfers.push({
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amountCents,
    })

    creditor.balanceCents -= amountCents
    debtor.balanceCents -= amountCents

    // Au moins l'un des deux tombe à zéro et ne revient pas : c'est ce qui borne le
    // résultat à N−1 virements.
    if (creditor.balanceCents > 0) creditors.push(creditor)
    if (debtor.balanceCents > 0) debtors.push(debtor)

    creditors.sort(byAmountThenId)
    debtors.sort(byAmountThenId)
  }

  return transfers
}

function byAmountThenId(left: Balance, right: Balance): number {
  return (
    right.balanceCents - left.balanceCents || left.participantId.localeCompare(right.participantId)
  )
}
