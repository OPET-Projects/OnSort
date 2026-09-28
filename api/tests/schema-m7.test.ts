import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'
import { seedEventWithParticipants } from './helpers/fixtures.ts'

// L'annulation d'une activité (conception §3.7) : une date posée, **aucune suppression
// physique**. Ce fichier couvre la colonne ; la route et ses permissions vivent dans
// `modules/activity-cancel.test.ts`.

it('naît non annulée', async () => {
  const { eventId, participants } = await seedEventWithParticipants(1)

  const activity = await prisma.activity.create({
    data: { eventId, title: 'Musée', proposedBy: participants[0].id },
  })

  expect(activity.cancelledAt).toBeNull()
})

it('accepte une date d’annulation puis son retrait', async () => {
  const { eventId, participants } = await seedEventWithParticipants(1)

  const activity = await prisma.activity.create({
    data: { eventId, title: 'Musée', proposedBy: participants[0].id },
  })

  const cancelled = await prisma.activity.update({
    where: { id: activity.id },
    data: { cancelledAt: new Date('2026-10-01T12:00:00Z') },
  })

  expect(cancelled.cancelledAt).toEqual(new Date('2026-10-01T12:00:00Z'))

  const restored = await prisma.activity.update({
    where: { id: activity.id },
    data: { cancelledAt: null },
  })

  expect(restored.cancelledAt).toBeNull()
})

// §3.7 : « les dépenses associées survivent — un acompte non remboursable existe ». Les
// votes aussi : annuler n'est pas supprimer.
it('ne supprime ni les votes ni les dépenses de l’activité annulée', async () => {
  const { eventId, participants, activityId } = await seedEventWithParticipants(2, {
    withActivity: true,
  })

  await prisma.activityVote.create({
    data: { activityId, participantId: participants[1].id, value: 'for' },
  })

  await prisma.expense.create({
    data: {
      eventId,
      activityId,
      label: 'Acompte',
      amountCents: 5000,
      paidBy: participants[0].id,
      createdBy: participants[0].id,
      shares: { create: [{ participantId: participants[0].id, amountCents: 5000 }] },
    },
  })

  await prisma.activity.update({
    where: { id: activityId },
    data: { cancelledAt: new Date() },
  })

  expect(await prisma.activity.count({ where: { id: activityId } })).toBe(1)
  expect(await prisma.activityVote.count({ where: { activityId } })).toBe(1)
  expect(await prisma.expense.count({ where: { activityId } })).toBe(1)
})
