import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { auth } from './auth.ts'
import { config } from './config.ts'
import { renderApiError } from './lib/http.ts'
import { requireSession } from './middleware/session.ts'
import { activitiesRoutes } from './modules/activities/routes.ts'
import { eventsRoutes } from './modules/events/routes.ts'
import { expensesRoutes } from './modules/expenses/routes.ts'
import { invitationsRoutes } from './modules/invitations/routes.ts'

export const app = new Hono()
  .get('/api/health', (c) => c.json({ status: 'ok' }))
  .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .get('/api/me', requireSession, (c) => c.json({ user: c.get('user') }))
  .route('/api/events', eventsRoutes)
  .route('/api/activities', activitiesRoutes)
  .route('/api/expenses', expensesRoutes)
  .route('/api/invitations', invitationsRoutes)
  .onError(renderApiError)

export type AppType = typeof app
export type { SessionUser } from './middleware/session.ts'

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: config.port })
  console.info(`API à l'écoute sur http://localhost:${config.port}`)
}
