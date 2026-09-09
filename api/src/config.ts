import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().min(1),
  // Source des tuiles. Vide **et** absente valent toutes deux « le défaut » : un
  // `MAP_TILES_URL=""` laissé dans un fichier d'exemple ne doit pas empêcher le démarrage,
  // et `.default()` de zod ne couvre que l'absence.
  MAP_TILES_URL: z.string().default(''),
  MAP_TILES_ATTRIBUTION: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

// Tuiles OpenStreetMap par défaut : leur politique d'usage autorise l'usage tiers sous
// conditions (decisions-techniques §2.6, corrigé au jalon M5). Aucune clé, aucun compte.
const DEFAULT_TILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

// L'attribution est une **condition** de cette politique, pas un ornement.
const DEFAULT_TILES_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export type Config = {
  databaseUrl: string
  port: number
  appUrl: string
  authSecret: string
  authUrl: string
  resendApiKey: string | null
  mailFrom: string
  mapTilesUrl: string
  mapTilesAttribution: string
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
    mapTilesUrl: parsed.MAP_TILES_URL === '' ? DEFAULT_TILES_URL : parsed.MAP_TILES_URL,
    // L'attribution suit la source : servir les tuiles d'un fournisseur sous l'attribution
    // d'un autre serait faux. Elle retombe donc sur le défaut seulement si l'URL aussi.
    mapTilesAttribution:
      parsed.MAP_TILES_ATTRIBUTION === ''
        ? parsed.MAP_TILES_URL === ''
          ? DEFAULT_TILES_ATTRIBUTION
          : ''
        : parsed.MAP_TILES_ATTRIBUTION,
    isProduction: parsed.NODE_ENV === 'production',
  }
}

export const config = loadConfig(process.env)
