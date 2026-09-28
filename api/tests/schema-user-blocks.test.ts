// api/tests/schema-user-blocks.test.ts
import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeUser(email: string) {
  return prisma.user.create({ data: { id: `u-${email}`, name: email, email } })
}

it('enregistre un blocage', async () => {
  const alice = await makeUser('alice@example.test')
  const bob = await makeUser('bob@example.test')

  await prisma.userBlock.create({ data: { blockerId: alice.id, blockedId: bob.id } })

  expect(await prisma.userBlock.count()).toBe(1)
})

it('refuse de se bloquer soi-même', async () => {
  const alice = await makeUser('alice@example.test')

  await expect(
    prisma.userBlock.create({ data: { blockerId: alice.id, blockedId: alice.id } }),
  ).rejects.toThrow()
})

it('refuse un blocage en double', async () => {
  const alice = await makeUser('alice@example.test')
  const bob = await makeUser('bob@example.test')
  await prisma.userBlock.create({ data: { blockerId: alice.id, blockedId: bob.id } })

  await expect(
    prisma.userBlock.create({ data: { blockerId: alice.id, blockedId: bob.id } }),
  ).rejects.toThrow()
})
