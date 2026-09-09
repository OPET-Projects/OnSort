# Jalon M0 — socle et authentification

> **Pour un agent exécutant :** utiliser `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** un utilisateur saisit son adresse, reçoit un lien magique, clique, et l'application
affiche son identité. C'est la démonstration de M0 : « je me connecte ».

**Architecture :** Better Auth porte l'authentification, adossé à Prisma pour le stockage et
à un service d'envoi maison qui bascule sur la console quand aucune clé Resend n'est
configurée. Hono monte le gestionnaire Better Auth sur `/api/auth/*` et expose `/api/me`,
protégée par la session. Le front est un écran de connexion minimal.

**Pile :** Node 24.20.0, Hono 4.13.7, Prisma 7.10.0 + `@prisma/adapter-pg`, Better Auth
1.7.3, Resend 6.26.0, Vitest 4.1.11, Vue 3.5.42 + Vite 8.2.2.

**Conception :** [`../conception.md`](../conception.md) — sections 2.1, 4 et 9.
**Versions :** [`../versions.md`](../versions.md).

## Contraintes globales

- Node **24.20.0** (`.nvmrc`). npm workspaces : `api/` et `web/`.
- Versions **épinglées à l'exact**. Aucune montée de version dans ce jalon.
- Toute montée de `prisma`, `@prisma/engines` ou `esbuild` impose de mettre à jour
  `allowScripts` dans `package.json` racine.
- Prisma 7 : l'URL de connexion vit dans `api/prisma.config.ts`, **jamais** dans
  `schema.prisma`. Le client s'instancie avec `@prisma/adapter-pg`.
- Le client Prisma généré (`api/src/generated/`) n'est pas versionné.
- Format et lint par Biome : guillemets simples, points-virgules omis, 100 colonnes,
  indentation de 2 espaces. Lancer `npx biome check --write .` avant chaque commit.
- Messages de commit en anglais, format Conventional Commits.
- **Aucun secret dans le dépôt.** Toute variable nouvelle est ajoutée à `.env.example` avec
  une valeur d'exemple inoffensive.
- Montants et durées : jamais de flottant pour de l'argent (sans objet dans ce jalon).

## Périmètre

**Dans M0** : configuration validée au démarrage, client Prisma, socle de tests
d'intégration, modèles d'authentification et première migration, envoi d'e-mail avec repli
console, Better Auth avec lien magique, montage sur Hono, `/api/me`, comptes de
développement, écran de connexion, CI qui applique les migrations.

**Hors M0** : groupes, événements, activités, dépenses, amis, notifications, SSE. Leurs
modèles Prisma arriveront avec leurs jalons respectifs — un jalon, une migration. On ne crée
pas aujourd'hui des tables que personne n'écrit.

---

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `api/src/config.ts` | Lecture et validation des variables d'environnement, une seule fois |
| `api/src/db.ts` | Instance unique de `PrismaClient` avec son adaptateur |
| `api/prisma/schema.prisma` | Modèles `User`, `Session`, `Account`, `Verification` |
| `api/src/lib/mailer.ts` | Envoi d'e-mail, Resend ou console |
| `api/src/auth.ts` | Instance Better Auth, greffon `magicLink` |
| `api/src/main.ts` | Application Hono, montage de l'authentification, `/api/me` |
| `api/prisma/seed.ts` | Comptes de développement |
| `api/tests/helpers/db.ts` | Nettoyage de la base entre les tests |
| `api/vitest.config.ts` | Configuration des tests de l'API |
| `web/src/lib/api.ts` | Client Hono RPC typé |
| `web/src/stores/session.ts` | État de session côté front |
| `web/src/views/LoginView.vue` | Écran de connexion |
| `web/src/views/HomeView.vue` | Écran connecté |
| `web/src/router.ts` | Routes et garde d'authentification |

---

## Tâche 1 : configuration validée au démarrage

Une variable manquante doit faire échouer le démarrage avec un message lisible, pas produire
une erreur obscure trois couches plus loin.

**Fichiers :**
- Créer : `api/src/config.ts`
- Créer : `api/tests/config.test.ts`
- Créer : `api/vitest.config.ts`
- Modifier : `.env.example`

**Interfaces :**
- Produit : `loadConfig(env: Record<string, string | undefined>): Config` et le type `Config`
  avec les champs `databaseUrl`, `port`, `appUrl`, `authSecret`, `authUrl`, `resendApiKey`
  (`string | null`), `mailFrom`, `isProduction`.
- Produit : `config`, résultat de `loadConfig(process.env)`, importé par les autres modules.

- [ ] **Étape 1 : créer la configuration Vitest de l'API**

`api/vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config'

// Vitest ne lit pas .env de lui-même, et src/config.ts valide l'environnement dès son
// chargement. Sans cette ligne, tout test qui importe un module de l'API échoue avant
// même de s'exécuter. En intégration continue les variables sont déjà présentes, d'où
// le try/catch.
try {
  process.loadEnvFile('../.env')
} catch {
  // pas de fichier .env : on compte sur l'environnement déjà chargé
}

// Forcé, pas `??=` : .env positionne NODE_ENV=development, et main.ts ouvre un port
// dès qu'il n'est pas en test. Un `??=` laisserait donc les tests démarrer un serveur.
process.env.NODE_ENV = 'test'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false
  }
})
```

Deux choix à comprendre :

- `process.loadEnvFile` est natif depuis Node 20.12 ; aucune dépendance supplémentaire.
- `fileParallelism: false` : les tests d'intégration partagent une base de données, ils ne
  doivent pas s'exécuter en parallèle.

- [ ] **Étape 2 : écrire le test qui échoue**

`api/tests/config.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'

const valid = {
  DATABASE_URL: 'postgresql://onsort:onsort@localhost:5432/onsort',
  BETTER_AUTH_SECRET: 'un-secret-de-test-suffisamment-long',
  BETTER_AUTH_URL: 'http://localhost:3000',
  APP_URL: 'http://localhost:5173',
  MAIL_FROM: 'On Sort ? <no-reply@example.test>'
}

describe('loadConfig', () => {
  it('lit une configuration complète', () => {
    const config = loadConfig(valid)
    expect(config.port).toBe(3000)
    expect(config.resendApiKey).toBeNull()
    expect(config.isProduction).toBe(false)
  })

  it('nomme la variable manquante', () => {
    const incomplete = { ...valid, BETTER_AUTH_SECRET: undefined }
    expect(() => loadConfig(incomplete)).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('refuse un secret trop court', () => {
    expect(() => loadConfig({ ...valid, BETTER_AUTH_SECRET: 'court' })).toThrow(
      /BETTER_AUTH_SECRET/
    )
  })

  it('traite une clé Resend vide comme absente', () => {
    expect(loadConfig({ ...valid, RESEND_API_KEY: '' }).resendApiKey).toBeNull()
  })
})
```

- [ ] **Étape 3 : lancer le test et vérifier qu'il échoue**

```sh
npm test --workspace api
```

Attendu : ÉCHEC, `Cannot find module '../src/config.ts'`.

- [ ] **Étape 4 : écrire l'implémentation**

`api/src/config.ts` :

```ts
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
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
    isProduction: parsed.NODE_ENV === 'production'
  }
}

export const config = loadConfig(process.env)
```

Note : `BETTER_AUTH_SECRET` exige 32 caractères, ce que produit
`openssl rand -base64 32`. Un secret court est une faiblesse silencieuse ; on la rend
bruyante.

- [ ] **Étape 5 : lancer le test et vérifier qu'il passe**

```sh
npm test --workspace api
```

Attendu : 4 tests réussis.

- [ ] **Étape 6 : compléter `.env.example`**

Ajouter, après la section Application :

```sh
# development | test | production
NODE_ENV=development
```

- [ ] **Étape 7 : commiter**

```sh
npx biome check --write .
git add api/src/config.ts api/tests/config.test.ts api/vitest.config.ts .env.example
git commit -m "feat(api): validate the environment at startup"
```

---

## Tâche 2 : client Prisma

**Fichiers :**
- Créer : `api/src/db.ts`
- Créer : `api/tests/db.test.ts`

**Interfaces :**
- Consomme : `config.databaseUrl` de la tâche 1.
- Produit : `prisma`, instance unique de `PrismaClient`, importée partout ailleurs.

- [ ] **Étape 1 : écrire le test qui échoue**

`api/tests/db.test.ts` :

```ts
import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

it('exécute une requête sur la base', async () => {
  const rows = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 AS one`
  expect(rows[0]?.one).toBe(1)
})
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```sh
npm run db:up
npm test --workspace api
```

Attendu : ÉCHEC, `Cannot find module '../src/db.ts'`.

- [ ] **Étape 3 : écrire l'implémentation**

`api/src/db.ts` :

```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from './config.ts'
import { PrismaClient } from './generated/prisma/client.ts'

const adapter = new PrismaPg({ connectionString: config.databaseUrl })

export const prisma = new PrismaClient({ adapter })
```

Une seule instance pour tout le processus : ouvrir un `PrismaClient` par requête épuiserait
le pool de connexions.

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

```sh
npm run db:generate
npm test --workspace api
```

Attendu : PASSE.

Si `./generated/prisma/client.ts` n'existe pas, c'est que `npm run db:generate` n'a pas été
lancé. Le client est généré, pas versionné.

- [ ] **Étape 5 : commiter**

```sh
npx biome check --write .
git add api/src/db.ts api/tests/db.test.ts
git commit -m "feat(api): add the Prisma client and its driver adapter"
```

---

## Tâche 3 : modèles d'authentification et première migration

**Fichiers :**
- Modifier : `api/prisma/schema.prisma`
- Créer : `api/prisma/migrations/<horodatage>_init_auth/migration.sql` (généré)
- Créer : `api/tests/schema.test.ts`

**Interfaces :**
- Produit : les modèles `User`, `Session`, `Account`, `Verification`, accessibles par
  `prisma.user`, `prisma.session`, `prisma.account`, `prisma.verification`.

- [ ] **Étape 1 : écrire le test qui échoue**

`api/tests/schema.test.ts` :

```ts
import { afterAll, expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'schema@example.test' } })
})

it('crée un utilisateur et le relit', async () => {
  const created = await prisma.user.create({
    data: {
      id: 'test-user-schema',
      name: 'Utilisateur de test',
      email: 'schema@example.test',
      emailVerified: false
    }
  })

  expect(created.email).toBe('schema@example.test')
  expect(created.createdAt).toBeInstanceOf(Date)
})

it('refuse deux utilisateurs avec la même adresse', async () => {
  await expect(
    prisma.user.create({
      data: {
        id: 'test-user-doublon',
        name: 'Doublon',
        email: 'schema@example.test',
        emailVerified: false
      }
    })
  ).rejects.toThrow()
})
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```sh
npm test --workspace api
```

Attendu : ÉCHEC — `prisma.user` n'existe pas, aucun modèle n'est défini.

- [ ] **Étape 3 : écrire les modèles**

Ajouter à la fin de `api/prisma/schema.prisma` :

```prisma
model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]

  @@map("user")
}

model Session {
  id        String   @id
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}
```

Ces quatre modèles sont ceux qu'attend Better Auth 1.7. Les `@@map` en minuscules
correspondent aux noms de tables qu'il utilise.

**Vérification croisée recommandée** avant de générer la migration :

```sh
cd api && npx @better-auth/cli@1.7.3 generate --config src/auth.ts
```

Cette commande produit le schéma attendu par la version installée. Si elle diffère de ce qui
précède, **suivre sa sortie** : elle fait autorité. Elle ne peut être lancée qu'après la
tâche 6, qui crée `src/auth.ts` ; à ce stade, comparer manuellement avec la documentation de
la version 1.7.

- [ ] **Étape 4 : générer et appliquer la migration**

```sh
npm run db:migrate --workspace api -- --name init_auth
```

Attendu : un dossier `api/prisma/migrations/<horodatage>_init_auth/` contenant
`migration.sql`, et les quatre tables créées.

- [ ] **Étape 5 : lancer le test et vérifier qu'il passe**

```sh
npm test --workspace api
```

Attendu : les deux tests de `schema.test.ts` passent, dont le rejet du doublon d'adresse.

- [ ] **Étape 6 : commiter**

```sh
npx biome check --write .
git add api/prisma/schema.prisma api/prisma/migrations api/tests/schema.test.ts
git commit -m "feat(api): add the authentication models and the initial migration"
```

---

## Tâche 4 : socle de tests d'intégration

Les tâches suivantes écrivent en base. Sans nettoyage entre les tests, ils deviennent
dépendants de leur ordre d'exécution — le pire défaut d'une suite de tests.

**Fichiers :**
- Créer : `api/tests/helpers/db.ts`
- Modifier : `api/vitest.config.ts`
- Créer : `api/tests/setup.ts`

**Interfaces :**
- Produit : `resetDatabase(): Promise<void>`, qui vide les tables de données en respectant
  les clés étrangères.

- [ ] **Étape 1 : écrire l'assistant de nettoyage**

`api/tests/helpers/db.ts` :

```ts
import { prisma } from '../../src/db.ts'

const TABLES = ['session', 'account', 'verification', 'user'] as const

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  )
}
```

L'ordre importe peu grâce à `CASCADE`, mais la liste est explicite : chaque jalon qui ajoute
des tables devra l'étendre, et c'est volontaire — un oubli se voit.

- [ ] **Étape 2 : brancher le nettoyage avant chaque test**

`api/tests/setup.ts` :

```ts
import { afterAll, beforeEach } from 'vitest'
import { prisma } from '../src/db.ts'
import { resetDatabase } from './helpers/db.ts'

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})
```

Modifier `api/vitest.config.ts` pour ajouter, dans l'objet `test` :

```ts
    setupFiles: ['tests/setup.ts'],
```

- [ ] **Étape 3 : simplifier `schema.test.ts`**

Le nettoyage étant automatique, retirer le bloc `afterAll` de `api/tests/schema.test.ts` et
son import de `prisma` s'il devient inutilisé. Le second test doit créer lui-même le premier
utilisateur, puisque la base est vide au début de chaque test :

```ts
it('refuse deux utilisateurs avec la même adresse', async () => {
  const data = {
    name: 'Doublon',
    email: 'schema@example.test',
    emailVerified: false
  }

  await prisma.user.create({ data: { ...data, id: 'test-user-premier' } })

  await expect(prisma.user.create({ data: { ...data, id: 'test-user-second' } })).rejects.toThrow()
})
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

```sh
npm test --workspace api
```

Attendu : tous passent. Les relancer une seconde fois **sans** redémarrer la base : ils
doivent passer à nouveau. C'est ce qui prouve que le nettoyage fonctionne.

- [ ] **Étape 5 : commiter**

```sh
npx biome check --write .
git add api/tests api/vitest.config.ts
git commit -m "test(api): reset the database before each integration test"
```

---

## Tâche 5 : envoi d'e-mail avec repli console

En développement, aucune clé Resend n'est configurée. Le lien magique doit alors s'afficher
dans la console : c'est ce qui permet de se connecter sans dépendre de la délivrabilité, et
c'est le filet de sécurité d'une démonstration.

**Fichiers :**
- Créer : `api/src/lib/mailer.ts`
- Créer : `api/tests/mailer.test.ts`

**Interfaces :**
- Consomme : `config.resendApiKey`, `config.mailFrom` de la tâche 1.
- Produit : `type Mail = { to: string; subject: string; text: string }`,
  `createMailer(options: { apiKey: string | null; from: string; logger?: (line: string) => void }): Mailer`,
  et `Mailer = { send(mail: Mail): Promise<void> }`.
- Produit : `mailer`, instance construite depuis `config`.

- [ ] **Étape 1 : écrire le test qui échoue**

`api/tests/mailer.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { createMailer } from '../src/lib/mailer.ts'

describe('createMailer sans clé', () => {
  it('écrit le message sur le journal au lieu de l’envoyer', async () => {
    const lines: string[] = []
    const mailer = createMailer({
      apiKey: null,
      from: 'On Sort ? <no-reply@example.test>',
      logger: (line) => lines.push(line)
    })

    await mailer.send({
      to: 'alice@example.test',
      subject: 'Votre lien de connexion',
      text: 'https://example.test/magic?token=abc'
    })

    expect(lines.join('\n')).toContain('alice@example.test')
    expect(lines.join('\n')).toContain('https://example.test/magic?token=abc')
  })
})
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```sh
npm test --workspace api -- mailer
```

Attendu : ÉCHEC, `Cannot find module '../src/lib/mailer.ts'`.

- [ ] **Étape 3 : écrire l'implémentation**

`api/src/lib/mailer.ts` :

```ts
import { Resend } from 'resend'
import { config } from '../config.ts'

export type Mail = {
  to: string
  subject: string
  text: string
}

export type Mailer = {
  send(mail: Mail): Promise<void>
}

type Options = {
  apiKey: string | null
  from: string
  logger?: (line: string) => void
}

export function createMailer({ apiKey, from, logger = console.info }: Options): Mailer {
  if (apiKey === null) {
    return {
      async send(mail) {
        logger(
          [
            '',
            '─── courriel non envoyé (aucune clé Resend) ───',
            `  de     : ${from}`,
            `  à      : ${mail.to}`,
            `  objet  : ${mail.subject}`,
            '',
            mail.text,
            '───────────────────────────────────────────────',
            ''
          ].join('\n')
        )
      }
    }
  }

  const resend = new Resend(apiKey)

  return {
    async send(mail) {
      const { error } = await resend.emails.send({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text
      })

      if (error) {
        throw new Error(`Envoi du courriel échoué : ${error.message}`)
      }
    }
  }
}

export const mailer = createMailer({
  apiKey: config.resendApiKey,
  from: config.mailFrom
})
```

L'erreur de Resend est explicitement relevée : une erreur d'envoi avalée silencieusement
donne un utilisateur qui attend un courriel qui n'arrivera jamais, sans trace nulle part.

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

```sh
npm test --workspace api -- mailer
```

Attendu : PASSE.

- [ ] **Étape 5 : commiter**

```sh
npx biome check --write .
git add api/src/lib/mailer.ts api/tests/mailer.test.ts
git commit -m "feat(api): send mail through Resend, or the console when unconfigured"
```

---

## Tâche 6 : instance Better Auth avec lien magique

**Fichiers :**
- Créer : `api/src/auth.ts`
- Créer : `api/tests/auth.test.ts`

**Interfaces :**
- Consomme : `prisma` (tâche 2), `mailer` (tâche 5), `config` (tâche 1).
- Produit : `auth`, dont `auth.handler(request: Request): Promise<Response>` et
  `auth.api.getSession({ headers })`.

- [ ] **Étape 1 : écrire le test qui échoue**

`api/tests/auth.test.ts` :

```ts
import { expect, it } from 'vitest'
import { auth } from '../src/auth.ts'
import { prisma } from '../src/db.ts'

it('crée une demande de lien magique pour une adresse inconnue', async () => {
  const response = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.test' })
    })
  )

  expect(response.status).toBe(200)

  const verifications = await prisma.verification.findMany()
  expect(verifications).toHaveLength(1)
})

it('ne renvoie pas de session sans cookie', async () => {
  const session = await auth.api.getSession({ headers: new Headers() })
  expect(session).toBeNull()
})
```

Le premier test vérifie aussi, implicitement, la règle anti-énumération de la conception
§4 : une adresse inconnue produit une réponse 200, comme une adresse connue.

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```sh
npm test --workspace api -- auth
```

Attendu : ÉCHEC, `Cannot find module '../src/auth.ts'`.

- [ ] **Étape 3 : écrire l'implémentation**

`api/src/auth.ts` :

```ts
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { magicLink } from 'better-auth/plugins'
import { config } from './config.ts'
import { prisma } from './db.ts'
import { mailer } from './lib/mailer.ts'

export const auth = betterAuth({
  appName: 'On Sort ?',
  secret: config.authSecret,
  baseURL: config.authUrl,
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  trustedOrigins: [config.appUrl],
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: config.isProduction,
      httpOnly: true
    }
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      async sendMagicLink({ email, url }) {
        await mailer.send({
          to: email,
          subject: 'Votre lien de connexion à On Sort ?',
          text: [
            'Bonjour,',
            '',
            'Voici votre lien de connexion. Il expire dans quinze minutes :',
            url,
            '',
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message."
          ].join('\n')
        })
      }
    })
  ]
})
```

Points qui comptent :

- `sameSite: 'lax'` et `httpOnly` : le cookie de session n'est pas lisible en JavaScript et
  ne part pas sur une requête inter-site. `secure` uniquement en production, sinon le cookie
  serait refusé sur `http://localhost`.
- `trustedOrigins` contient l'origine du front de développement, servi par Vite sur un autre
  port. En production, front et API partagent la même origine.
- `expiresIn: 900` — quinze minutes. Un lien magique à durée longue est un mot de passe qui
  traîne dans une boîte de réception.

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

```sh
npm test --workspace api -- auth
```

Attendu : PASSE, et le lien magique apparaît dans la sortie de la console.

- [ ] **Étape 5 : vérifier le schéma avec l'outil officiel**

```sh
cd api && npx @better-auth/cli@1.7.3 generate --config src/auth.ts
```

Comparer la sortie à `prisma/schema.prisma`. En cas d'écart, corriger le schéma, générer une
migration (`npm run db:migrate --workspace api -- --name fix_auth_schema`) et relancer les
tests. **La sortie de l'outil fait autorité sur les modèles écrits à la tâche 3.**

- [ ] **Étape 6 : commiter**

```sh
npx biome check --write .
git add api/src/auth.ts api/tests/auth.test.ts api/prisma
git commit -m "feat(api): set up Better Auth with magic-link sign-in"
```

---

## Tâche 7 : montage sur Hono et route `/api/me`

**Fichiers :**
- Modifier : `api/src/main.ts`
- Créer : `api/src/middleware/session.ts`
- Créer : `api/tests/routes.test.ts`

**Interfaces :**
- Consomme : `auth` (tâche 6), `config` (tâche 1).
- Produit : `AppType`, type du routeur exporté, consommé par le front à la tâche 9.
- Produit : `requireSession`, intergiciel Hono qui place `user` et `session` dans le
  contexte, ou répond 401.
- Produit : `type SessionUser = { id: string; email: string; name: string }`.

- [ ] **Étape 1 : écrire le test qui échoue**

`api/tests/routes.test.ts` :

```ts
import { expect, it } from 'vitest'
import { app } from '../src/main.ts'

it('répond sur la sonde de santé', async () => {
  const response = await app.request('/api/health')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})

it('refuse /api/me sans session', async () => {
  const response = await app.request('/api/me')

  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ code: 'unauthenticated' })
})

it('expose le gestionnaire d’authentification', async () => {
  const response = await app.request('/api/auth/sign-in/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.test' })
  })

  expect(response.status).toBe(200)
})
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```sh
npm test --workspace api -- routes
```

Attendu : ÉCHEC — `main.ts` n'exporte pas `app`, et `/api/me` n'existe pas.

- [ ] **Étape 3 : écrire l'intergiciel**

`api/src/middleware/session.ts` :

```ts
import { createMiddleware } from 'hono/factory'
import { auth } from '../auth.ts'

export type SessionUser = {
  id: string
  email: string
  name: string
}

type Variables = {
  user: SessionUser
}

export const requireSession = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    return c.json({ code: 'unauthenticated', message: 'Authentification requise' }, 401)
  }

  c.set('user', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name
  })

  return next()
})
```

- [ ] **Étape 4 : réécrire `main.ts`**

`api/src/main.ts` :

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { auth } from './auth.ts'
import { config } from './config.ts'
import { requireSession } from './middleware/session.ts'

export const app = new Hono()
  .get('/api/health', (c) => c.json({ status: 'ok' }))
  .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .get('/api/me', requireSession, (c) => c.json({ user: c.get('user') }))

export type AppType = typeof app
export type { SessionUser } from './middleware/session.ts'

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: config.port })
  console.info(`API à l'écoute sur http://localhost:${config.port}`)
}
```

Le serveur ne démarre pas sous test : `app.request()` de Hono exécute les routes sans ouvrir
de port, ce qui rend les tests rapides et exempts de conflits de port.

- [ ] **Étape 5 : lancer le test et vérifier qu'il passe**

```sh
npm test --workspace api -- routes
```

Attendu : les trois tests passent.

- [ ] **Étape 6 : vérifier manuellement le parcours complet**

```sh
npm run dev --workspace api
```

Dans un autre terminal :

```sh
curl -s -X POST http://localhost:3000/api/auth/sign-in/magic-link \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.test"}'
```

Attendu : réponse 200, et le lien magique affiché dans la console du serveur. Ouvrir ce lien
dans un navigateur, puis vérifier la session :

```sh
curl -s http://localhost:3000/api/me -b cookies.txt
```

- [ ] **Étape 7 : commiter**

```sh
npx biome check --write .
git add api/src/main.ts api/src/middleware api/tests/routes.test.ts
git commit -m "feat(api): mount authentication on Hono and expose the current user"
```

---

## Tâche 8 : comptes de développement

Se connecter en développement doit prendre une seconde, pas un aller-retour dans une boîte
de réception.

**Fichiers :**
- Créer : `api/prisma/seed.ts`
- Modifier : `api/package.json`
- Modifier : `api/prisma.config.ts`
- Modifier : `README.md`

**Interfaces :**
- Produit : trois utilisateurs aux adresses `alice@example.test`, `bob@example.test`,
  `carla@example.test`.

- [ ] **Étape 1 : écrire le script**

`api/prisma/seed.ts` :

```ts
import { config } from '../src/config.ts'
import { prisma } from '../src/db.ts'

const PEOPLE = [
  { id: 'dev-alice', name: 'Alice', email: 'alice@example.test' },
  { id: 'dev-bob', name: 'Bob', email: 'bob@example.test' },
  { id: 'dev-carla', name: 'Carla', email: 'carla@example.test' }
]

async function main(): Promise<void> {
  if (config.isProduction) {
    throw new Error('Le jeu de données de développement ne doit pas être appliqué en production.')
  }

  for (const person of PEOPLE) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: {},
      create: { ...person, emailVerified: true }
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
```

Le garde-fou sur la production n'est pas décoratif : un jeu de données de test appliqué sur
une base réelle est une catastrophe silencieuse.

- [ ] **Étape 2 : déclarer le script**

Dans `api/package.json`, ajouter à `scripts` :

```json
    "db:seed": "tsx --env-file=../.env prisma/seed.ts",
```

Dans `api/prisma.config.ts`, ajouter la clé `migrations.seed` :

```ts
  migrations: { path: 'prisma/migrations', seed: 'tsx --env-file=../.env prisma/seed.ts' },
```

Dans le `package.json` racine, ajouter à `scripts` :

```json
    "db:seed": "npm run db:seed --workspace api",
```

- [ ] **Étape 3 : exécuter et vérifier**

```sh
npm run db:seed
```

Attendu : `3 comptes de développement disponibles.` Relancer la commande : elle doit
réussir à nouveau sans erreur de doublon — c'est l'intérêt d'`upsert`.

- [ ] **Étape 4 : documenter dans le README**

Dans la section Démarrage, après `npm run db:migrate` :

```sh
npm run db:seed             # comptes de développement : alice@, bob@, carla@example.test
```

- [ ] **Étape 5 : commiter**

```sh
npx biome check --write .
git add api/prisma/seed.ts api/prisma.config.ts api/package.json package.json README.md
git commit -m "feat(api): seed development accounts"
```

---

## Tâche 9 : écran de connexion

**Fichiers :**
- Créer : `web/src/lib/api.ts`
- Créer : `web/src/stores/session.ts`
- Créer : `web/src/views/LoginView.vue`
- Créer : `web/src/views/HomeView.vue`
- Créer : `web/src/router.ts`
- Modifier : `web/src/main.ts`
- Modifier : `web/src/App.vue`
- Créer : `web/tests/session.test.ts`

**Interfaces :**
- Consomme : `AppType` de la tâche 7, et les routes `/api/me` et
  `/api/auth/sign-in/magic-link`.
- Produit : `useSessionStore()` avec `user: SessionUser | null`, `status: 'unknown' |
  'anonymous' | 'authenticated'`, `fetchSession(): Promise<void>`,
  `requestMagicLink(email: string): Promise<void>`.
- `SessionUser` n'est **pas** redéfini côté front : il est importé depuis `api`, réexporté par
  `api/src/main.ts`. Une seule définition, deux usages — c'est tout l'intérêt du monorepo.

- [ ] **Étape 1 : écrire le test qui échoue**

`web/tests/session.test.ts` :

```ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { useSessionStore } from '../src/stores/session.ts'

beforeEach(() => {
  setActivePinia(createPinia())
})

it('passe en anonyme quand la session est refusée', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 401 }))
  )

  const store = useSessionStore()
  await store.fetchSession()

  expect(store.status).toBe('anonymous')
  expect(store.user).toBeNull()
})

it('retient l’utilisateur quand la session est valide', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ user: { id: 'u1', email: 'alice@example.test', name: 'Alice' } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )
  )

  const store = useSessionStore()
  await store.fetchSession()

  expect(store.status).toBe('authenticated')
  expect(store.user?.email).toBe('alice@example.test')
})
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```sh
npm test --workspace web
```

Attendu : ÉCHEC, module `../src/stores/session.ts` introuvable.

- [ ] **Étape 3 : écrire le client typé**

`web/src/lib/api.ts` :

```ts
import { hc } from 'hono/client'
import type { AppType } from 'api'

export const api = hc<AppType>('/', { init: { credentials: 'include' } })
```

`credentials: 'include'` est indispensable : sans lui, le cookie de session n'accompagne pas
les requêtes vers l'API en développement, où les origines diffèrent.

- [ ] **Étape 4 : écrire le magasin**

`web/src/stores/session.ts` :

```ts
import type { SessionUser } from 'api'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated'

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)
  const status = ref<SessionStatus>('unknown')

  async function fetchSession(): Promise<void> {
    const response = await fetch('/api/me', { credentials: 'include' })

    if (!response.ok) {
      user.value = null
      status.value = 'anonymous'
      return
    }

    const body = (await response.json()) as { user: SessionUser }
    user.value = body.user
    status.value = 'authenticated'
  }

  async function requestMagicLink(email: string): Promise<void> {
    const response = await fetch('/api/auth/sign-in/magic-link', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/' })
    })

    if (!response.ok) {
      throw new Error("L'envoi du lien a échoué. Réessayez dans un instant.")
    }
  }

  return { user, status, fetchSession, requestMagicLink }
})
```

- [ ] **Étape 5 : lancer le test et vérifier qu'il passe**

```sh
npm test --workspace web
```

Attendu : les deux tests passent.

- [ ] **Étape 6 : écrire les vues**

`web/src/views/LoginView.vue` :

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const email = ref('')
const state = ref<'idle' | 'sending' | 'sent' | 'error'>('idle')
const message = ref('')

async function submit(): Promise<void> {
  state.value = 'sending'

  try {
    await session.requestMagicLink(email.value)
    state.value = 'sent'
  } catch (error) {
    state.value = 'error'
    message.value = error instanceof Error ? error.message : 'Une erreur est survenue.'
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
    <h1 class="text-2xl font-semibold">On Sort ?</h1>

    <form v-if="state !== 'sent'" class="flex flex-col gap-3" @submit.prevent="submit">
      <label class="flex flex-col gap-1">
        <span class="text-sm">Adresse e-mail</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="rounded border border-neutral-300 px-3 py-2 text-base"
        />
      </label>

      <button
        type="submit"
        :disabled="state === 'sending'"
        class="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {{ state === 'sending' ? 'Envoi…' : 'Recevoir un lien de connexion' }}
      </button>

      <p v-if="state === 'error'" class="text-sm text-red-700">{{ message }}</p>
    </form>

    <p v-else class="text-sm">
      Si un compte existe pour cette adresse, un lien de connexion vient d'être envoyé.
      Il expire dans quinze minutes.
    </p>
  </main>
</template>
```

Le message de confirmation est **volontairement identique** que le compte existe ou non :
c'est la règle anti-énumération de la conception §4.

`web/src/views/HomeView.vue` :

```vue
<script setup lang="ts">
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
</script>

<template>
  <main class="mx-auto max-w-2xl p-6 md:p-10">
    <h1 class="text-2xl font-semibold">Bonjour {{ session.user?.name }}</h1>
    <p class="mt-2 text-neutral-600">{{ session.user?.email }}</p>
  </main>
</template>
```

- [ ] **Étape 7 : écrire le routeur et la garde**

`web/src/router.ts` :

```ts
import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from './stores/session'
import HomeView from './views/HomeView.vue'
import LoginView from './views/LoginView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView }
  ]
})

router.beforeEach(async (to) => {
  const session = useSessionStore()

  if (session.status === 'unknown') {
    await session.fetchSession()
  }

  if (to.meta.requiresAuth && session.status !== 'authenticated') {
    return { name: 'login' }
  }

  if (to.name === 'login' && session.status === 'authenticated') {
    return { name: 'home' }
  }

  return true
})
```

- [ ] **Étape 8 : brancher le tout**

`web/src/main.ts` :

```ts
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')
```

`web/src/App.vue` :

```vue
<script setup lang="ts"></script>

<template>
  <RouterView />
</template>
```

- [ ] **Étape 9 : vérifier le parcours de bout en bout**

```sh
npm run db:up && npm run dev
```

Ouvrir `http://localhost:5173`. Attendu : redirection vers `/login`. Saisir
`alice@example.test`, valider, copier le lien affiché dans la console de l'API, l'ouvrir.
Attendu : « Bonjour Alice ».

**Vérifier aussi en largeur mobile** (375 px dans les outils de développement) : c'est la
règle mobile d'abord de la conception §6.

- [ ] **Étape 10 : commiter**

```sh
npx biome check --write .
git add web/src web/tests
git commit -m "feat(web): add the sign-in screen and the session store"
```

---

## Tâche 10 : appliquer les migrations dans la CI

Les tests d'intégration écrivent en base. Sans migration appliquée, la CI échoue sur des
tables absentes.

**Fichiers :**
- Modifier : `.github/workflows/ci.yml`

- [ ] **Étape 1 : ajouter l'étape de migration**

Dans `.github/workflows/ci.yml`, entre « Générer le client Prisma » et « Vérification des
types » :

```yaml
      - name: Appliquer les migrations
        run: npx prisma migrate deploy --schema api/prisma/schema.prisma
```

`migrate deploy` et non `migrate dev` : la seconde est interactive et peut réinitialiser la
base.

- [ ] **Étape 2 : ajouter les variables manquantes**

Le bloc `env` du travail doit contenir `NODE_ENV: test` et `PORT: 3000`, faute de quoi
`loadConfig` échoue au chargement des modules de test.

- [ ] **Étape 3 : vérifier localement la séquence complète**

```sh
npm ci
npm run db:generate
npx prisma migrate deploy --schema api/prisma/schema.prisma
npx biome ci .
npm run typecheck
npm test
npm run build
```

Attendu : tout passe. C'est exactement la séquence de la CI.

- [ ] **Étape 4 : commiter et pousser**

```sh
git add .github/workflows/ci.yml
git commit -m "ci: apply migrations before running the tests"
git push
```

- [ ] **Étape 5 : vérifier le résultat de la CI**

```sh
gh run watch
```

Attendu : vert. En cas d'échec, corriger avant de considérer M0 terminé.

---

## Critère d'achèvement de M0

- [ ] `npm ci && npm run db:generate && npx biome ci . && npm run typecheck && npm test && npm run build` passe.
- [ ] La CI est verte sur la branche.
- [ ] Un utilisateur inconnu saisit son adresse, reçoit un lien, clique, et voit son nom.
- [ ] Une adresse inconnue et une adresse connue produisent la même réponse visible.
- [ ] `npm run db:seed` est idempotent et refuse de s'exécuter en production.
- [ ] L'écran de connexion est utilisable à 375 px de large.

## Ce que M0 ne contient pas

Groupes, événements, activités, dépenses, amis, notifications, SSE. Leurs modèles Prisma et
leurs migrations arrivent avec leurs jalons : une migration par jalon, jamais de table créée
avant que du code ne l'écrive.

Le déploiement n'est pas dans M0 mais devient un livrable de **M1**, dont la démonstration
suppose une URL publique.
