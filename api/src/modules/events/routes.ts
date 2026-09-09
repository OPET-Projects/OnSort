import { Hono } from 'hono'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { createEventSchema } from './schema.ts'
import { createEvent, getEvent, listEvents } from './service.ts'

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
