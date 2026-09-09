import { Hono } from 'hono'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { updateExpenseSchema } from './schema.ts'
import { updateExpense } from './service.ts'

export const expensesRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .patch('/:id', jsonBody(updateExpenseSchema), async (c) => {
    const expense = await updateExpense(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json({ expense })
  })
