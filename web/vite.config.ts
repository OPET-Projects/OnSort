import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Vite ne lit pas .env de lui-même pour son propre fichier de configuration. Sans cette
// ligne, PORT n'est renseigné que s'il a été exporté dans le shell, et le mandataire
// ci-dessous pointe alors toujours sur 3000 malgré un .env différent.
try {
  process.loadEnvFile('../.env')
} catch (error) {
  // Un .env absent est normal en intégration continue, où les variables sont déjà
  // présentes. Toute autre erreur — fichier illisible ou malformé — doit rester visible.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3000}` },
  },
  test: {
    environment: 'happy-dom',
  },
})
