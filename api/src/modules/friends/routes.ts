import { Hono } from 'hono'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { friendRequestSchema } from './schema.ts'
import {
  acceptFriendRequest,
  blockUser,
  declineFriendRequest,
  listFriends,
  removeFriend,
  requestFriendship,
  unblockUser,
} from './service.ts'

export const friendsRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .get('/', async (c) => {
    return c.json(await listFriends(c.get('user').id))
  })
  .post('/requests', jsonBody(friendRequestSchema), async (c) => {
    return c.json(await requestFriendship(c.get('user').id, c.req.valid('json')))
  })
  .post('/requests/:id/accept', async (c) => {
    return c.json(await acceptFriendRequest(c.get('user').id, c.req.param('id')))
  })
  .post('/requests/:id/decline', async (c) => {
    return c.json(await declineFriendRequest(c.get('user').id, c.req.param('id')))
  })
  // `/blocks/:userId` avant `/:userId` : sinon « blocks » serait lu comme un identifiant.
  .post('/blocks/:userId', async (c) => {
    return c.json(await blockUser(c.get('user').id, c.req.param('userId')))
  })
  .delete('/blocks/:userId', async (c) => {
    return c.json(await unblockUser(c.get('user').id, c.req.param('userId')))
  })
  .delete('/:userId', async (c) => {
    return c.json(await removeFriend(c.get('user').id, c.req.param('userId')))
  })
