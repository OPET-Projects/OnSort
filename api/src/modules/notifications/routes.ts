import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type ServerEvent, subscribe, userRoom } from '../../lib/sse.ts'
import { queryParams } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { feedQuerySchema } from './schema.ts'
import { listNotifications, markNotificationRead } from './service.ts'

// Même battement de cœur que le flux d'événement de M2 : sans trafic, un mandataire ferme
// une connexion inactive (conception §5.2).
const HEARTBEAT_MS = 30_000

export const notificationsRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .get('/notifications', async (c) => {
    const query = queryParams(feedQuerySchema, c.req.query())
    return c.json(await listNotifications(c.get('user').id, query))
  })
  .post('/notifications/:id/read', async (c) => {
    return c.json(await markNotificationRead(c.get('user').id, c.req.param('id')))
  })
  // Flux personnel (§5.2). Il n'a pas de permission à vérifier au-delà de la session : on
  // s'abonne à son propre salon, jamais à celui d'un autre — l'identifiant vient de la
  // session et non de l'URL, ce qui rend l'écoute d'autrui inexprimable.
  .get('/me/stream', async (c) => {
    const room = userRoom(c.get('user').id)

    c.header('Cache-Control', 'no-cache')
    c.header('X-Accel-Buffering', 'no')

    return streamSSE(c, async (stream) => {
      const pending: ServerEvent[] = []
      let notifyReady: (() => void) | null = null

      const unsubscribe = subscribe(room, (event) => {
        pending.push(event)
        notifyReady?.()
      })

      const heartbeat = setInterval(() => {
        void stream.writeSSE({ data: '', event: 'ping' })
      }, HEARTBEAT_MS)

      stream.onAbort(() => {
        clearInterval(heartbeat)
        unsubscribe()
        notifyReady?.()
      })

      while (!stream.aborted && !stream.closed) {
        const event = pending.shift()

        if (event === undefined) {
          await new Promise<void>((resolve) => {
            notifyReady = resolve
          })
          notifyReady = null
          continue
        }

        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      }

      clearInterval(heartbeat)
      unsubscribe()
    })
  })
