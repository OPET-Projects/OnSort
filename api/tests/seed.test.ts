import { expect, it } from 'vitest'
import { seed } from '../prisma/seed.ts'
import { prisma } from '../src/db.ts'

// Le jeu de développement sert les démonstrations : il doit rester **cohérent avec le
// domaine**, pas seulement s'insérer. Un solde qui ne tombe pas à zéro ou une part qui ne
// somme pas au montant se verrait sur l'écran des dépenses, au pire moment.

it('sème un événement complet', async () => {
  await seed()

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: 'dev-event-raclette' },
    include: { participants: true, activities: { include: { votes: true } } },
  })

  expect(event.status).toBe('active')
  expect(event.startsAt.getTime()).toBeGreaterThan(Date.now())
  expect(event.startsAt.getTime()).toBeLessThan(event.endsAt.getTime())
  expect(event.participants).toHaveLength(3)
  expect(event.participants.filter((p) => p.rsvp === 'accepted')).toHaveLength(2)
  expect(event.activities).toHaveLength(3)
  expect(event.activities.flatMap((activity) => activity.votes)).toHaveLength(4)
})

it('sème des dépenses dont les parts somment au montant', async () => {
  await seed()

  const expenses = await prisma.expense.findMany({
    where: { eventId: 'dev-event-raclette' },
    include: { shares: true },
  })

  expect(expenses).toHaveLength(2)

  for (const expense of expenses) {
    const shared = expense.shares.reduce((total, share) => total + share.amountCents, 0)
    expect(shared).toBe(expense.amountCents)
  }
})

// Aucun solde n'est stocké : celui-ci se dérive, exactement comme le fait le service.
it('sème un déséquilibre que le virement en attente solde exactement', async () => {
  await seed()

  const [expenses, settlement] = await Promise.all([
    prisma.expense.findMany({
      where: { eventId: 'dev-event-raclette' },
      include: { shares: true },
    }),
    prisma.settlement.findFirstOrThrow({ where: { eventId: 'dev-event-raclette' } }),
  ])

  const balances = new Map<string, number>()
  const move = (participantId: string, cents: number) =>
    balances.set(participantId, (balances.get(participantId) ?? 0) + cents)

  for (const expense of expenses) {
    move(expense.paidBy, expense.amountCents)
    for (const share of expense.shares) {
      move(share.participantId, -share.amountCents)
    }
  }

  expect([...balances.values()].reduce((total, cents) => total + cents, 0)).toBe(0)
  expect(balances.get(settlement.toParticipantId)).toBe(settlement.amountCents)
  expect(balances.get(settlement.fromParticipantId)).toBe(-settlement.amountCents)
  // Déclaré, jamais confirmé : c'est l'état qui montre les deux boutons.
  expect(settlement.confirmedAt).toBeNull()
})

// Relancer le seed ne doit rien empiler : c'est ce qu'on fait après chaque `npm test`.
it('se rejoue sans dupliquer', async () => {
  await seed()
  await seed()

  expect(await prisma.event.count()).toBe(1)
  expect(await prisma.user.count()).toBe(3)
  expect(await prisma.expenseShare.count()).toBe(4)
  expect(await prisma.friendship.count()).toBe(1)
  expect(await prisma.notification.count()).toBe(3)
})
