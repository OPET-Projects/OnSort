import { prisma } from '../../src/db.ts'

const TABLES = ['session', 'account', 'verification', 'user'] as const

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  )
}
