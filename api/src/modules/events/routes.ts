import { Hono } from 'hono'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { createEventSchema, inviteSchema, rsvpSchema, updateEventSchema } from './schema.ts'
import {
  createEvent,
  createInvitation,
  getEvent,
  listEvents,
  setRsvp,
  updateEvent,
} from './service.ts'

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
