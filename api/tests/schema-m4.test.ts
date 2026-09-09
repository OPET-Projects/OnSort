import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeUser(email: string) {
  return prisma.user.create({ data: { id: `u-${email}`, name: email, email } })
}

it('relie un groupe à ses membres', async () => {
  const alice = await makeUser('alice@example.test')

  const group = await prisma.group.create({
    data: {
      name: 'Les copains',
      createdBy: alice.id,
      members: { create: { userId: alice.id, role: 'admin' } },
    },
    include: { members: true },
  })

  expect(group.members).toHaveLength(1)
  expect(group.members[0]?.role).toBe('admin')
})

it("n'accepte qu'une adhésion par personne et par groupe", async () => {
  const alice = await makeUser('alice@example.test')
  const group = await prisma.group.create({ data: { name: 'G', createdBy: alice.id } })

  await prisma.groupMember.create({ data: { groupId: group.id, userId: alice.id } })

  await expect(
    prisma.groupMember.create({ data: { groupId: group.id, userId: alice.id } }),
  ).rejects.toThrow()
})

it('entre au rôle « member » par défaut', async () => {
  const alice = await makeUser('alice@example.test')
  const group = await prisma.group.create({ data: { name: 'G', createdBy: alice.id } })

  const member = await prisma.groupMember.create({
    data: { groupId: group.id, userId: alice.id },
  })

  expect(member.role).toBe('member')
})

// Bornes semi-ouvertes (§2.4) : une plage vide ou inversée n'est pas une indisponibilité.
// La contrainte vit dans la migration, Prisma ne modélisant pas les CHECK.
it.each([
  ['inversée', '2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z'],
  ['vide', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'],
])('refuse une plage %s', async (_label, startsAt, endsAt) => {
  const alice = await makeUser('alice@example.test')

  await expect(
    prisma.unavailability.create({
      data: { userId: alice.id, startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
    }),
  ).rejects.toThrow()
})

it('garde le libellé facultatif', async () => {
  const alice = await makeUser('alice@example.test')

  const row = await prisma.unavailability.create({
    data: {
      userId: alice.id,
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: new Date('2026-10-02T00:00:00Z'),
    },
  })

  expect(row.label).toBeNull()
})

// Quitter l'application emporte ses indisponibilités : elles n'ont aucun sens sans leur
// auteur, et le calendrier partagé les lirait encore.
it('supprime les indisponibilités avec leur auteur', async () => {
  const alice = await makeUser('alice@example.test')
  await prisma.unavailability.create({
    data: {
      userId: alice.id,
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: new Date('2026-10-02T00:00:00Z'),
    },
  })

  await prisma.user.delete({ where: { id: alice.id } })

  expect(await prisma.unavailability.count()).toBe(0)
})
