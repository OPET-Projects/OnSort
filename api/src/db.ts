import { PrismaPg } from '@prisma/adapter-pg'
import { config } from './config.ts'
import { PrismaClient } from './generated/prisma/client.ts'

const adapter = new PrismaPg({ connectionString: config.databaseUrl })

export const prisma = new PrismaClient({ adapter })
