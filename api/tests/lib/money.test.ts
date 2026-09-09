import { expect, it } from 'vitest'
import { splitEqually } from '../../src/lib/money.ts'

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
