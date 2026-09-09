import { Hono } from 'hono'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { confirmSettlement, withdrawSettlement } from '../expenses/service.ts'

// Les règlements vivent dans le service des dépenses : ils partagent son domaine — l'argent
// de l'événement — et sa notion de participant autorisé. Seules leurs routes sont montées à
// part, la conception §5.1 les plaçant sous `/settlements/:id`.
export const settlementsRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .post('/:id/confirm', async (c) => {
    const settlement = await confirmSettlement(c.get('user').id, c.req.param('id'))
    return c.json({ settlement })
  })
  .delete('/:id', async (c) => {
    return c.json(await withdrawSettlement(c.get('user').id, c.req.param('id')))
  })
