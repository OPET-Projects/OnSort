import { afterAll, beforeEach } from 'vitest'
import { prisma } from '../src/db.ts'
import { resetInvitationQuotas } from '../src/lib/invitation-quota.ts'
import { resetDatabase } from './helpers/db.ts'

beforeEach(async () => {
  await resetDatabase()
  // Compteurs en mémoire : sans remise à zéro, ils fuiraient d'un test à l'autre.
  resetInvitationQuotas()
})

afterAll(async () => {
  await prisma.$disconnect()
})
