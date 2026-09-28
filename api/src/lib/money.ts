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

// Ordre des identifiants, **exactement** celui de `splitEqually` : la comparaison par unités
// de code d'un `sort()` sans argument, jamais `localeCompare`. Les deux ne classent pas
// 'Z' et 'a' dans le même ordre, et « les premiers identifiants triés » doit désigner les
// mêmes personnes dans les trois modes de partage.
function byParticipantId(left: Share, right: Share): number {
  if (left.participantId === right.participantId) return 0
  return left.participantId < right.participantId ? -1 : 1
}

// Le reste d'une division, réparti par la règle unique de §3.5 : les `remainder` premiers
// participants, **triés par identifiant**, reçoivent un centime supplémentaire. Les trois
// modes de partage passent par ici — une seconde règle d'arrondi dans ce fichier finirait
// par diverger de la première.
function spreadRemainder(shares: Share[], amountCents: number): Share[] {
  const sorted = [...shares].sort(byParticipantId)
  const remainder = amountCents - sorted.reduce((sum, share) => sum + share.amountCents, 0)

  return sorted.map((share, index) => ({
    ...share,
    amountCents: share.amountCents + (index < remainder ? 1 : 0),
  }))
}

export type PercentWeight = {
  participantId: string
  percent: number
}

// Partage en pourcentage (§2.8 note 3). Les pourcentages sont **entiers** : un pourcentage
// fractionnaire ferait dépendre le total de l'arithmétique flottante — 33,33 + 33,33 + 33,34
// ne vaut pas exactement 100 en machine — et la vérification « le total fait 100 » perdrait
// son sens. Le domaine financier n'admet aucun flottant, pas même un multiplicateur.
export function splitByPercent(amountCents: number, weights: readonly PercentWeight[]): Share[] {
  assertWholeCents(amountCents)

  if (weights.length === 0) {
    throw new Error('Une dépense doit être partagée entre au moins un participant.')
  }

  for (const weight of weights) {
    if (!Number.isInteger(weight.percent) || weight.percent < 0) {
      throw new Error(`Pourcentage entier positif attendu, reçu ${weight.percent}.`)
    }
  }

  const total = weights.reduce((sum, weight) => sum + weight.percent, 0)

  if (total !== 100) {
    throw new Error(`Les pourcentages doivent totaliser 100, ils totalisent ${total}.`)
  }

  // `trunc` et non `round` : arrondir au plus proche pourrait distribuer plus que le montant,
  // et le reste à répartir deviendrait négatif.
  const floored = weights.map((weight) => ({
    participantId: weight.participantId,
    amountCents: Math.trunc((amountCents * weight.percent) / 100),
  }))

  return spreadRemainder(floored, amountCents)
}

// Partage en montant fixe (§2.8 note 3). Rien à calculer : les parts sont données, et la
// seule chose à faire est de refuser celles qui casseraient l'invariant. L'écart figure dans
// le message — un formulaire qui n'indique pas qu'il manque 3 € se solde par un refus
// incompréhensible.
export function splitByFixed(amountCents: number, parts: readonly Share[]): Share[] {
  assertWholeCents(amountCents)

  if (parts.length === 0) {
    throw new Error('Une dépense doit être partagée entre au moins un participant.')
  }

  for (const part of parts) {
    assertWholeCents(part.amountCents)

    if (part.amountCents < 0) {
      throw new Error(`Part positive attendue, reçue ${part.amountCents}.`)
    }
  }

  const total = parts.reduce((sum, part) => sum + part.amountCents, 0)

  if (total !== amountCents) {
    const gap = amountCents - total
    throw new Error(
      `Les parts totalisent ${total} centimes au lieu de ${amountCents} : il ${gap > 0 ? `manque ${gap}` : `sort ${-gap}`} centimes.`,
    )
  }

  return [...parts]
    .map((part) => ({ participantId: part.participantId, amountCents: part.amountCents }))
    .sort(byParticipantId)
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
