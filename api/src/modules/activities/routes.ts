import { Hono } from 'hono'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { decisionSchema, updateActivitySchema, voteSchema } from './schema.ts'
import { castVote, decideActivity, updateActivity } from './service.ts'

export const activitiesRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .patch('/:id', jsonBody(updateActivitySchema), async (c) => {
    const activity = await updateActivity(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json({ activity })
  })
  .post('/:id/vote', jsonBody(voteSchema), async (c) => {
    const counts = await castVote(c.get('user').id, c.req.param('id'), c.req.valid('json').value)
    return c.json(counts)
  })
  .post('/:id/decision', jsonBody(decisionSchema), async (c) => {
    const activity = await decideActivity(
      c.get('user').id,
      c.req.param('id'),
      c.req.valid('json').status,
    )
    return c.json({ activity })
  })
