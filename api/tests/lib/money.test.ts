import { expect, it } from 'vitest'
import { computeBalances, splitEqually } from '../../src/lib/money.ts'

it('partage un montant divisible', () => {
  expect(splitEqually(900, ['a', 'b', 'c'])).toEqual([
    { participantId: 'a', amountCents: 300 },
    { participantId: 'b', amountCents: 300 },
    { participantId: 'c', amountCents: 300 },
  ])
})

// Le cœur du jalon : 10 € entre 3 personnes ne tombe pas juste. Le reste va aux premiers
// participants **triés par identifiant**, de façon déterministe (§3.5).
it('répartit le reste sur les premiers participants triés par identifiant', () => {
  expect(splitEqually(1000, ['c', 'a', 'b'])).toEqual([
    { participantId: 'a', amountCents: 334 },
    { participantId: 'b', amountCents: 333 },
    { participantId: 'c', amountCents: 333 },
  ])
})

it("tient l'invariant SUM(parts) = montant sur mille montants", () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

  for (let amount = 1; amount <= 1000; amount += 1) {
    const total = splitEqually(amount, ids).reduce((sum, share) => sum + share.amountCents, 0)
    expect(total).toBe(amount)
  }
})

it('donne tout au seul participant', () => {
  expect(splitEqually(777, ['a'])).toEqual([{ participantId: 'a', amountCents: 777 }])
})

it('refuse une liste vide', () => {
  expect(() => splitEqually(100, [])).toThrow()
})

it('refuse un montant non entier', () => {
  expect(() => splitEqually(10.5, ['a', 'b'])).toThrow()
})

// Un montant plus petit que le nombre de participants ne se divise pas : les premiers
// reçoivent un centime, les autres zéro. Refuser serait pire — la dépense existe.
it('donne un centime aux premiers quand le montant est plus petit que le groupe', () => {
  expect(splitEqually(2, ['a', 'b', 'c'])).toEqual([
    { participantId: 'a', amountCents: 1 },
    { participantId: 'b', amountCents: 1 },
    { participantId: 'c', amountCents: 0 },
  ])
})

it('crédite celui qui a avancé et débite ceux qui doivent', () => {
  const balances = computeBalances({
    participantIds: ['a', 'b'],
    expenses: [
      {
        paidBy: 'a',
        amountCents: 1000,
        shares: [
          { participantId: 'a', amountCents: 500 },
          { participantId: 'b', amountCents: 500 },
        ],
      },
    ],
    settlements: [],
  })

  expect(balances).toEqual([
    { participantId: 'a', balanceCents: 500 },
    { participantId: 'b', balanceCents: -500 },
  ])
})

it('éteint une dette par un règlement', () => {
  const balances = computeBalances({
    participantIds: ['a', 'b'],
    expenses: [
      {
        paidBy: 'a',
        amountCents: 1000,
        shares: [
          { participantId: 'a', amountCents: 500 },
          { participantId: 'b', amountCents: 500 },
        ],
      },
    ],
    settlements: [{ fromParticipantId: 'b', toParticipantId: 'a', amountCents: 500 }],
  })

  expect(balances).toEqual([
    { participantId: 'a', balanceCents: 0 },
    { participantId: 'b', balanceCents: 0 },
  ])
})

// §2.8 note 1 : un règlement est une ligne indépendante. Si la dépense change après coup,
// le virement garde sa valeur et le delta réapparaît dans le solde.
it('laisse reparaître le delta quand la dépense change après un règlement', () => {
  const balances = computeBalances({
    participantIds: ['a', 'b'],
    expenses: [
      {
        paidBy: 'a',
        amountCents: 2000,
        shares: [
          { participantId: 'a', amountCents: 1000 },
          { participantId: 'b', amountCents: 1000 },
        ],
      },
    ],
    settlements: [{ fromParticipantId: 'b', toParticipantId: 'a', amountCents: 500 }],
  })

  expect(balances).toEqual([
    { participantId: 'a', balanceCents: 500 },
    { participantId: 'b', balanceCents: -500 },
  ])
})

it('rend un solde nul pour un participant sans dépense ni part', () => {
  expect(computeBalances({ participantIds: ['z'], expenses: [], settlements: [] })).toEqual([
    { participantId: 'z', balanceCents: 0 },
  ])
})

// La somme des soldes doit toujours être nulle : c'est l'invariant qui prouve qu'aucun
// centime n'a été créé ni perdu.
it('somme à zéro', () => {
  const shares = splitEqually(1000, ['a', 'b', 'c'])
  const balances = computeBalances({
    participantIds: ['a', 'b', 'c'],
    expenses: [{ paidBy: 'a', amountCents: 1000, shares }],
    settlements: [{ fromParticipantId: 'b', toParticipantId: 'a', amountCents: 333 }],
  })

  expect(balances.reduce((sum, balance) => sum + balance.balanceCents, 0)).toBe(0)
})

// Une part peut viser quelqu'un qui a quitté l'événement depuis. Sa part reste due :
// l'ignorer ferait disparaître des centimes et la somme cesserait d'être nulle.
it('compte la part de celui qui ne figure plus parmi les participants', () => {
  const balances = computeBalances({
    participantIds: ['a'],
    expenses: [
      {
        paidBy: 'a',
        amountCents: 1000,
        shares: [
          { participantId: 'a', amountCents: 500 },
          { participantId: 'parti', amountCents: 500 },
        ],
      },
    ],
    settlements: [],
  })

  expect(balances.reduce((sum, balance) => sum + balance.balanceCents, 0)).toBe(0)
  expect(balances).toContainEqual({ participantId: 'parti', balanceCents: -500 })
})
