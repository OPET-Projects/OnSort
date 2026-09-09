import { Hono } from 'hono'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { attendanceSchema, decisionSchema, updateActivitySchema, voteSchema } from './schema.ts'
import { castVote, decideActivity, listPresent, setAttendance, updateActivity } from './service.ts'

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
  .post('/:id/attendance', jsonBody(attendanceSchema), async (c) => {
    const result = await setAttendance(
      c.get('user').id,
      c.req.param('id'),
      c.req.valid('json').present,
    )
    return c.json(result)
  })
  .get('/:id/attendance', async (c) => {
    return c.json({ present: await listPresent(c.get('user').id, c.req.param('id')) })
  })
  .post('/:id/decision', jsonBody(decisionSchema), async (c) => {
    const activity = await decideActivity(
      c.get('user').id,
      c.req.param('id'),
      c.req.valid('json').status,
    )
    return c.json({ activity })
  })
