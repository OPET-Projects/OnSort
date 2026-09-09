import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'
import { seedEventWithParticipants } from './helpers/fixtures.ts'

it('enregistre une dépense, ses parts et un règlement', async () => {
  const { eventId, participants } = await seedEventWithParticipants(3)
  const [payer, other] = participants

  const expense = await prisma.expense.create({
    data: {
      eventId,
      label: 'Taxi',
      amountCents: 1000,
      paidBy: payer.id,
      splitMode: 'equal',
      createdBy: payer.id,
      shares: {
        create: [
          { participantId: payer.id, amountCents: 500 },
          { participantId: other.id, amountCents: 500 },
        ],
      },
    },
    include: { shares: true },
  })

  expect(expense.currency).toBe('EUR')
  expect(expense.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(
    expense.amountCents,
  )

  const settlement = await prisma.settlement.create({
    data: {
      eventId,
      fromParticipantId: other.id,
      toParticipantId: payer.id,
      amountCents: 500,
    },
  })

  expect(settlement.confirmedAt).toBeNull()
  expect(settlement.declaredAt).toBeInstanceOf(Date)
})

// Les trois contraintes ci-dessous vivent dans la migration, pas dans schema.prisma :
// Prisma ne modélise pas les CHECK. Les tester ici est le seul garde-fou contre une
// migration future qui les oublierait.
it('refuse une dépense de montant nul', async () => {
  const { eventId, participants } = await seedEventWithParticipants(2)

  await expect(
    prisma.expense.create({
      data: {
        eventId,
        label: 'Gratuit',
        amountCents: 0,
        paidBy: participants[0].id,
        splitMode: 'equal',
        createdBy: participants[0].id,
      },
    }),
  ).rejects.toThrow()
})

it('refuse un règlement de montant négatif', async () => {
  const { eventId, participants } = await seedEventWithParticipants(2)

  await expect(
    prisma.settlement.create({
      data: {
        eventId,
        fromParticipantId: participants[1].id,
        toParticipantId: participants[0].id,
        amountCents: -100,
      },
    }),
  ).rejects.toThrow()
})

it('refuse un règlement vers soi-même', async () => {
  const { eventId, participants } = await seedEventWithParticipants(2)

  await expect(
    prisma.settlement.create({
      data: {
        eventId,
        fromParticipantId: participants[0].id,
        toParticipantId: participants[0].id,
        amountCents: 100,
      },
    }),
  ).rejects.toThrow()
})

it("n'enregistre qu'une absence par participant et par activité", async () => {
  const { participants, activityId } = await seedEventWithParticipants(2, { withActivity: true })

  await prisma.activityAbsence.create({
    data: { activityId, participantId: participants[0].id },
  })

  await expect(
    prisma.activityAbsence.create({
      data: { activityId, participantId: participants[0].id },
    }),
  ).rejects.toThrow()
})

it("n'enregistre qu'une part par participant et par dépense", async () => {
  const { eventId, participants } = await seedEventWithParticipants(2)

  const expense = await prisma.expense.create({
    data: {
      eventId,
      label: 'Taxi',
      amountCents: 1000,
      paidBy: participants[0].id,
      splitMode: 'equal',
      createdBy: participants[0].id,
      shares: { create: [{ participantId: participants[0].id, amountCents: 1000 }] },
    },
  })

  await expect(
    prisma.expenseShare.create({
      data: { expenseId: expense.id, participantId: participants[0].id, amountCents: 1 },
    }),
  ).rejects.toThrow()
})

// Le mode de présence par défaut est `all` (§3.4) : sans réglage explicite, les présents
// sont tous ceux qui ont accepté l'événement.
it('crée une activité en mode de présence « all »', async () => {
  const { activityId } = await seedEventWithParticipants(2, { withActivity: true })

  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } })

  expect(activity.attendanceMode).toBe('all')
})
