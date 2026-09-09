import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeParticipation(email: string) {
  const user = await prisma.user.create({
    data: { id: `u-${email}`, name: email, email, emailVerified: true },
  })
  const event = await prisma.event.create({
    data: {
      title: 'Sortie',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T22:00:00Z'),
      createdBy: user.id,
    },
  })
  const participant = await prisma.eventParticipant.create({
    data: { eventId: event.id, userId: user.id, role: 'admin', rsvp: 'accepted' },
  })

  return { user, event, participant }
}

it('relie une activité à son événement et à ses votes', async () => {
  const { event, participant } = await makeParticipation('alice@example.test')

  const activity = await prisma.activity.create({
    data: { eventId: event.id, title: 'Musée', proposedBy: participant.id },
  })
  await prisma.activityVote.create({
    data: { activityId: activity.id, participantId: participant.id, value: 'for' },
  })

  const reread = await prisma.activity.findUniqueOrThrow({
    where: { id: activity.id },
    include: { votes: true },
  })

  expect(reread.status).toBe('proposed')
  expect(reread.position).toBe(0)
  expect(reread.votes).toHaveLength(1)
  expect(reread.votes[0]?.value).toBe('for')
})

it('interdit deux votes du même participant sur une activité', async () => {
  const { event, participant } = await makeParticipation('alice@example.test')
  const activity = await prisma.activity.create({
    data: { eventId: event.id, title: 'Musée', proposedBy: participant.id },
  })
  const vote = { activityId: activity.id, participantId: participant.id }

  await prisma.activityVote.create({ data: { ...vote, value: 'for' } })

  await expect(prisma.activityVote.create({ data: { ...vote, value: 'against' } })).rejects.toThrow()
})

it('emporte activités et votes avec l’événement supprimé', async () => {
  const { event, participant } = await makeParticipation('alice@example.test')
  const activity = await prisma.activity.create({
    data: { eventId: event.id, title: 'Musée', proposedBy: participant.id },
  })
  await prisma.activityVote.create({
    data: { activityId: activity.id, participantId: participant.id, value: 'for' },
  })

  await prisma.event.delete({ where: { id: event.id } })

  expect(await prisma.activity.count()).toBe(0)
  expect(await prisma.activityVote.count()).toBe(0)
})
