import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type Config = {
  databaseUrl: string
  port: number
  appUrl: string
  authSecret: string
  authUrl: string
  resendApiKey: string | null
  mailFrom: string
  isProduction: boolean
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = schema.safeParse(env)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.')} : ${issue.message}`)
      .join('\n')
    throw new Error(`Configuration invalide :\n${details}`)
  }

  const parsed = result.data

  return {
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.PORT,
    appUrl: parsed.APP_URL,
    authSecret: parsed.BETTER_AUTH_SECRET,
    authUrl: parsed.BETTER_AUTH_URL,
    resendApiKey: parsed.RESEND_API_KEY === '' ? null : parsed.RESEND_API_KEY,
    mailFrom: parsed.MAIL_FROM,
    isProduction: parsed.NODE_ENV === 'production',
  }
}

export const config = loadConfig(process.env)
