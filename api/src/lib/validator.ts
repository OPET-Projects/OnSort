import { zValidator } from '@hono/zod-validator'
import type { ZodType } from 'zod'
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
