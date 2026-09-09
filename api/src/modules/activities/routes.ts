import { Hono } from 'hono'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { voteSchema } from './schema.ts'
import { castVote } from './service.ts'

export const activitiesRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .post('/:id/vote', jsonBody(voteSchema), async (c) => {
    const counts = await castVote(c.get('user').id, c.req.param('id'), c.req.valid('json').value)
    return c.json(counts)
  })
