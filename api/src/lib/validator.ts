import { zValidator } from '@hono/zod-validator'
import { createMiddleware } from 'hono/factory'
import type { ZodType, z } from 'zod'
import { ApiError } from './http.ts'

// Validation d'un corps JSON à la frontière (conception §5.1). Un échec de schéma devient
// une `ApiError` à la forme uniforme plutôt que la réponse par défaut de la bibliothèque.
export function jsonBody<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result) => {
    if (!result.success) {
      throw new ApiError('validation_error', 400, 'Requête invalide.', {
        issues: result.error.issues,
      })
    }
  })
}

// Corps JSON **facultatif**. Un POST sans corps est légitime quand tous les champs ont un
// défaut — ouvrir un lien d'invitation sans préciser sa réponse, par exemple. `jsonBody`
// rendrait alors un `validation_error` pour une requête pourtant valide.
export function optionalJsonBody<T extends ZodType>(schema: T) {
  return createMiddleware<{ Variables: { body: z.infer<T> } }>(async (c, next) => {
    const raw = await c.req.json().catch(() => ({}))
    const result = schema.safeParse(raw)

    if (!result.success) {
      throw new ApiError('validation_error', 400, 'Requête invalide.', {
        issues: result.error.issues,
      })
    }

    c.set('body', result.data)
    await next()
  })
}
