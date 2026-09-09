import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeUser(email: string) {
  return prisma.user.create({
    data: { id: `u-${email}`, name: email, email, emailVerified: true },
  })
}

async function makeEvent(createdBy: string) {
  return prisma.event.create({
    data: {
      title: 'Sortie',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T22:00:00Z'),
      createdBy,
    },
  })
}

it('relie un événement à ses participants', async () => {
  const alice = await makeUser('alice@example.test')
  const event = await makeEvent(alice.id)
  await prisma.eventParticipant.create({
    data: { eventId: event.id, userId: alice.id, role: 'admin', rsvp: 'accepted' },
  })

  const reread = await prisma.event.findUniqueOrThrow({
    where: { id: event.id },
    include: { participants: true },
  })

  expect(reread.status).toBe('draft')
  expect(reread.participants).toHaveLength(1)
  expect(reread.participants[0]?.role).toBe('admin')
})

it('interdit deux fois le même participant sur un événement', async () => {
  const alice = await makeUser('alice@example.test')
  const event = await makeEvent(alice.id)
  await prisma.eventParticipant.create({ data: { eventId: event.id, userId: alice.id } })

  await expect(
    prisma.eventParticipant.create({ data: { eventId: event.id, userId: alice.id } }),
  ).rejects.toThrow()
})

it('interdit deux liens au même hachage de jeton', async () => {
  const alice = await makeUser('alice@example.test')
  const event = await makeEvent(alice.id)
  const base = { scope: 'event' as const, targetId: event.id, createdBy: alice.id }

  await prisma.inviteLink.create({ data: { ...base, tokenHash: 'h' } })
  await expect(prisma.inviteLink.create({ data: { ...base, tokenHash: 'h' } })).rejects.toThrow()
})

it('exige une identité sur une invitation', async () => {
  const alice = await makeUser('alice@example.test')
  const event = await makeEvent(alice.id)

  await expect(
    prisma.invitation.create({
      data: { scope: 'event', targetId: event.id, invitedBy: alice.id },
    }),
  ).rejects.toThrow()
})
