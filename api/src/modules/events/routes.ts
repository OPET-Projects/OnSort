import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type ServerEvent, subscribe } from '../../lib/sse.ts'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { createActivitySchema } from '../activities/schema.ts'
import { createActivity, listActivities } from '../activities/service.ts'
import { createExpenseSchema, declareSettlementSchema } from '../expenses/schema.ts'
import { createExpense, declareSettlement, getBalances, listExpenses } from '../expenses/service.ts'
import { createEventSchema, inviteSchema, rsvpSchema, updateEventSchema } from './schema.ts'
import {
  createEvent,
  createInvitation,
  getEvent,
  listEvents,
  loadParticipant,
  setRsvp,
  updateEvent,
} from './service.ts'

// Battement de cœur : sans trafic, un mandataire ou un pare-feu ferme une connexion
// inactive (conception §5.2). Un commentaire SSE suffit et ne déclenche aucun `message`
// côté client.
const HEARTBEAT_MS = 30_000

export const eventsRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .post('/', jsonBody(createEventSchema), async (c) => {
    const event = await createEvent(c.get('user').id, c.req.valid('json'))
    return c.json({ id: event.id }, 201)
  })
  .get('/', async (c) => {
    return c.json({ events: await listEvents(c.get('user').id) })
  })
  .get('/:id', async (c) => {
    return c.json({ event: await getEvent(c.get('user').id, c.req.param('id')) })
  })
  .patch('/:id', jsonBody(updateEventSchema), async (c) => {
    const event = await updateEvent(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json({ event })
  })
  .post('/:id/rsvp', jsonBody(rsvpSchema), async (c) => {
    await setRsvp(c.get('user').id, c.req.param('id'), c.req.valid('json').rsvp)
    return c.json({ ok: true })
  })
  .post('/:id/invitations', jsonBody(inviteSchema), async (c) => {
    const result = await createInvitation(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json(result)
  })
  .post('/:id/activities', jsonBody(createActivitySchema), async (c) => {
    const activity = await createActivity(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json({ id: activity.id }, 201)
  })
  .get('/:id/activities', async (c) => {
    return c.json({ activities: await listActivities(c.get('user').id, c.req.param('id')) })
  })
  .post('/:id/expenses', jsonBody(createExpenseSchema), async (c) => {
    const expense = await createExpense(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json({ id: expense.id, expense }, 201)
  })
  .get('/:id/expenses', async (c) => {
    return c.json({ expenses: await listExpenses(c.get('user').id, c.req.param('id')) })
  })
  .get('/:id/balances', async (c) => {
    return c.json(await getBalances(c.get('user').id, c.req.param('id')))
  })
  .post('/:id/settlements', jsonBody(declareSettlementSchema), async (c) => {
    const settlement = await declareSettlement(
      c.get('user').id,
      c.req.param('id'),
      c.req.valid('json'),
    )
    return c.json({ settlement }, 201)
  })
  .get('/:id/stream', async (c) => {
    const eventId = c.req.param('id')

    // La permission est vérifiée **avant** d'ouvrir le flux : une fois les en-têtes SSE
    // émis, on ne peut plus répondre par un code d'erreur.
    await loadParticipant(c.get('user').id, eventId)

    c.header('Cache-Control', 'no-cache')
    c.header('X-Accel-Buffering', 'no')

    return streamSSE(c, async (stream) => {
      const pending: ServerEvent[] = []
      let notify: (() => void) | null = null

      const unsubscribe = subscribe(eventId, (event) => {
        pending.push(event)
        notify?.()
      })

      const heartbeat = setInterval(() => {
        void stream.writeSSE({ data: '', event: 'ping' })
      }, HEARTBEAT_MS)

      // `EventSource` ne permet pas d'envoyer d'en-têtes : l'authentification passe par le
      // cookie de session, déjà validé ci-dessus.
      stream.onAbort(() => {
        clearInterval(heartbeat)
        unsubscribe()
        notify?.()
      })

      while (!stream.aborted && !stream.closed) {
        const event = pending.shift()

        if (event === undefined) {
          await new Promise<void>((resolve) => {
            notify = resolve
          })
          notify = null
          continue
        }

        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      }

      clearInterval(heartbeat)
      unsubscribe()
    })
  })
