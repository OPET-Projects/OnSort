import { prisma } from '../../src/db.ts'

// Chaque jalon qui ajoute des tables étend cette liste à la main : un oubli se voit.
// `CASCADE` rend l'ordre indifférent.
const TABLES = [
  'unavailability',
  'group_members',
  'groups',
  'expense_shares',
  'expenses',
  'settlements',
  'activity_absences',
  'activity_votes',
  'activities',
  'invitations',
  'invite_links',
  'event_participants',
  'events',
  'session',
  'account',
  'verification',
  'user',
] as const

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  )
}
