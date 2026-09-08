import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

it('exécute une requête sur la base', async () => {
  const rows = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 AS one`
  expect(rows[0]?.one).toBe(1)
})
