import { Hono } from 'hono'
import { jsonBody, queryParams } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { addUnavailabilitySchema, windowSchema } from './schema.ts'
import { addUnavailability, listUnavailability, removeUnavailability } from './service.ts'

export const calendarRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .get('/unavailability', async (c) => {
    const window = queryParams(windowSchema, c.req.query())
    return c.json({ unavailability: await listUnavailability(c.get('user').id, window) })
  })
  .post('/unavailability', jsonBody(addUnavailabilitySchema), async (c) => {
    const row = await addUnavailability(c.get('user').id, c.req.valid('json'))
    return c.json({ unavailability: row }, 201)
  })
  .delete('/unavailability/:id', async (c) => {
    return c.json(await removeUnavailability(c.get('user').id, c.req.param('id')))
  })
