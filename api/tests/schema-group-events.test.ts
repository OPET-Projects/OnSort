import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeUser(email: string) {
  return prisma.user.create({ data: { id: `u-${email}`, name: email, email } })
}

const period = {
  startsAt: new Date('2026-10-01T18:00:00Z'),
  endsAt: new Date('2026-10-01T22:00:00Z'),
}

it('refuse un événement rattaché à un groupe inexistant', async () => {
  const alice = await makeUser('alice@example.test')

  await expect(
    prisma.event.create({
      data: {
        title: 'Sortie',
        ...period,
        createdBy: alice.id,
        groupId: '00000000-0000-4000-8000-000000000000',
      },
    }),
  ).rejects.toThrow()
})

// Un groupe supprimé ne doit pas emporter ses sorties : leurs dépenses sont de l'argent réel.
it("détache les événements d'un groupe supprimé au lieu de les supprimer", async () => {
  const alice = await makeUser('alice@example.test')
  const group = await prisma.group.create({ data: { name: 'G', createdBy: alice.id } })
  const event = await prisma.event.create({
    data: { title: 'Sortie', ...period, createdBy: alice.id, groupId: group.id },
  })

  await prisma.group.delete({ where: { id: group.id } })

  const reread = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
  expect(reread.groupId).toBeNull()
})

it('relie un événement à son groupe', async () => {
  const alice = await makeUser('alice@example.test')
  const group = await prisma.group.create({ data: { name: 'G', createdBy: alice.id } })
  await prisma.event.create({
    data: { title: 'Sortie', ...period, createdBy: alice.id, groupId: group.id },
  })

  const reread = await prisma.group.findUniqueOrThrow({
    where: { id: group.id },
    include: { events: true },
  })
  expect(reread.events).toHaveLength(1)
})
