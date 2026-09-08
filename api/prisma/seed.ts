import { config } from '../src/config.ts'
import { prisma } from '../src/db.ts'

const PEOPLE = [
  { id: 'dev-alice', name: 'Alice', email: 'alice@example.test' },
  { id: 'dev-bob', name: 'Bob', email: 'bob@example.test' },
  { id: 'dev-carla', name: 'Carla', email: 'carla@example.test' },
]

async function main(): Promise<void> {
  if (config.isProduction) {
    throw new Error('Le jeu de données de développement ne doit pas être appliqué en production.')
  }

  for (const person of PEOPLE) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: {},
      create: { ...person, emailVerified: true },
    })
  }

  console.info(`${PEOPLE.length} comptes de développement disponibles.`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
