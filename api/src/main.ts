import { serve } from '@hono/node-server'
import type { ErrorHandler } from 'hono'
import { Hono } from 'hono'
import { auth } from './auth.ts'
import { config } from './config.ts'
import { requireSession } from './middleware/session.ts'

// Gestionnaire d'erreur global : une exception levée par n'importe quelle route (panne
// de base, session malformée, etc.) doit rester dans la forme uniforme des erreurs plutôt
// que de retomber sur le 500 générique de Hono. Le détail de l'exception est journalisé
// pour l'exploitation, jamais renvoyé au client.
export const handleServerError: ErrorHandler = (error, c) => {
  console.error(`Erreur interne non gérée sur ${c.req.method} ${c.req.path} :`, error)

  return c.json(
    { code: 'internal_error', message: 'Une erreur interne est survenue.', details: {} },
    500,
  )
}

export const app = new Hono()
  .get('/api/health', (c) => c.json({ status: 'ok' }))
  .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .get('/api/me', requireSession, (c) => c.json({ user: c.get('user') }))
  .onError(handleServerError)

export type AppType = typeof app
export type { SessionUser } from './middleware/session.ts'

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: config.port })
  console.info(`API à l'écoute sur http://localhost:${config.port}`)
}
