import { Hono } from 'hono'
import { jsonBody, queryParams } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { calendarWindowSchema, createGroupSchema, inviteMemberSchema } from './schema.ts'
import { createGroup, getGroup, getGroupCalendar, inviteToGroup, listGroups } from './service.ts'

export const groupsRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .post('/', jsonBody(createGroupSchema), async (c) => {
    const group = await createGroup(c.get('user').id, c.req.valid('json'))
    return c.json({ id: group.id, group }, 201)
  })
  .get('/', async (c) => {
    return c.json({ groups: await listGroups(c.get('user').id) })
  })
  .get('/:id', async (c) => {
    return c.json({ group: await getGroup(c.get('user').id, c.req.param('id')) })
  })
  .post('/:id/members', jsonBody(inviteMemberSchema), async (c) => {
    const result = await inviteToGroup(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json(result)
  })
  .get('/:id/calendar', async (c) => {
    const window = queryParams(calendarWindowSchema, c.req.query())
    return c.json(await getGroupCalendar(c.get('user').id, c.req.param('id'), window))
  })
