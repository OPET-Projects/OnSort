import { Hono } from 'hono'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { acceptInvitation, previewInvitation } from './service.ts'

export const invitationsRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .get('/:token', async (c) => {
    const user = c.get('user')
    const preview = await previewInvitation(
      { id: user.id, email: user.email },
      c.req.param('token'),
    )
    return c.json(preview)
  })
  .post('/:token/accept', async (c) => {
    const user = c.get('user')
    const result = await acceptInvitation({ id: user.id, email: user.email }, c.req.param('token'))
    return c.json(result)
  })
