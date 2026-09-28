import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'

// Prisma 7 ne lit plus .env de lui-même, et la CLI (migrate, generate) s'exécute en
// dehors de Vitest, qui ne charge cette variable que pour les tests. Sans cette ligne,
// DATABASE_URL est vide et la CLI échoue avant même de lire le schéma.
//
// Le chemin est résolu depuis **ce fichier**, pas depuis le répertoire courant : sinon une
// commande lancée depuis la racine du dépôt cherchait `.env` un cran trop haut.
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch (error) {
  // Un .env absent est normal en intégration continue, où les variables sont déjà
  // présentes. Toute autre erreur — fichier illisible ou malformé — doit rester visible.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx --env-file=../.env prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
