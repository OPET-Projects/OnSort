import { afterAll, expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'schema@example.test' } })
})

it('crée un utilisateur et le relit', async () => {
  const created = await prisma.user.create({
    data: {
      id: 'test-user-schema',
      name: 'Utilisateur de test',
      email: 'schema@example.test',
      emailVerified: false,
    },
  })

  expect(created.email).toBe('schema@example.test')
  expect(created.createdAt).toBeInstanceOf(Date)
})

it('refuse deux utilisateurs avec la même adresse', async () => {
  await expect(
    prisma.user.create({
      data: {
        id: 'test-user-doublon',
        name: 'Doublon',
        email: 'schema@example.test',
        emailVerified: false,
      },
    }),
  ).rejects.toThrow()
})
