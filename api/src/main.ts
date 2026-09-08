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
