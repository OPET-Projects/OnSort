import { afterAll, beforeEach } from 'vitest'
import { prisma } from '../src/db.ts'
import { resetDatabase } from './helpers/db.ts'

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})
