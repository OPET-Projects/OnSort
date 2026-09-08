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
    fileParallelism: false,
  },
})
