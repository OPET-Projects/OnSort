import { createMiddleware } from 'hono/factory'
import { auth } from '../auth.ts'
import { ApiError } from '../lib/http.ts'

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
    throw new ApiError('unauthenticated', 401, 'Authentification requise')
  }

  c.set('user', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  })

  return next()
})
