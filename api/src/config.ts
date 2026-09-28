import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().default(''),
  // Connexion par Google. Les deux vont ensemble : une moitié seule est une erreur de
  // configuration, pas une intention.
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
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

export type GoogleCredentials = {
  clientId: string
  clientSecret: string
}

export type Config = {
  databaseUrl: string
  port: number
  appUrl: string
  authSecret: string
  authUrl: string
  resendApiKey: string | null
  // `null` quand la connexion par Google n'est pas configurée : le bouton disparaît alors de
  // l'écran de connexion plutôt que de mener à une erreur du fournisseur.
  google: GoogleCredentials | null
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

  // La suite de tests charge le `.env` du développeur, clé Resend comprise. Sans cette
  // garde, lancer `npm test` expédierait de vrais courriels — sur son quota, et vers les
  // adresses inventées par les fixtures. En test, l'envoi retombe toujours sur la console.
  const sendsMail = parsed.NODE_ENV !== 'test'

  const hasGoogleId = parsed.GOOGLE_CLIENT_ID !== ''
  const hasGoogleSecret = parsed.GOOGLE_CLIENT_SECRET !== ''

  if (hasGoogleId !== hasGoogleSecret) {
    throw new Error(
      'Configuration invalide :\n  GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET vont ensemble : renseignez les deux, ou aucune.',
    )
  }

  return {
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.PORT,
    appUrl: parsed.APP_URL,
    authSecret: parsed.BETTER_AUTH_SECRET,
    authUrl: parsed.BETTER_AUTH_URL,
    resendApiKey: sendsMail && parsed.RESEND_API_KEY !== '' ? parsed.RESEND_API_KEY : null,
    google: hasGoogleId
      ? { clientId: parsed.GOOGLE_CLIENT_ID, clientSecret: parsed.GOOGLE_CLIENT_SECRET }
      : null,
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
