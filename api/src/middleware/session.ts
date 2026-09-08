import { createMiddleware } from 'hono/factory'
import { auth } from '../auth.ts'

export type SessionUser = {
  id: string
  email: string
  name: string
}

type Variables = {
  user: SessionUser
}

export const requireSession = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    return c.json(
      { code: 'unauthenticated', message: 'Authentification requise', details: {} },
      401,
    )
  }

  c.set('user', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  })

  return next()
})
