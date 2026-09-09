import { Hono } from 'hono'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { acceptInvitation } from './service.ts'

export const invitationsRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .post('/:token/accept', async (c) => {
    const user = c.get('user')
    const result = await acceptInvitation({ id: user.id, email: user.email }, c.req.param('token'))
    return c.json(result)
  })
