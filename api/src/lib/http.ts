import type { ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

// Erreur métier destinée au client. Elle porte le code applicatif, le statut HTTP et un
// `details` toujours présent — la forme uniforme de toute l'API (conception §8). Une route
// la lève, le gestionnaire global la traduit ; aucune route ne construit le corps d'erreur
// à la main.
export class ApiError extends Error {
  readonly code: string
  readonly status: ContentfulStatusCode
  readonly details: Record<string, unknown>

  constructor(
    code: string,
    status: ContentfulStatusCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

// Gestionnaire d'erreur global. Une `ApiError` devient sa réponse ; toute autre exception
// (panne de base, bogue) devient un 500 générique, son détail étant journalisé pour
// l'exploitation et jamais renvoyé au client.
export const renderApiError: ErrorHandler = (error, c) => {
  if (error instanceof ApiError) {
    return c.json(
      { code: error.code, message: error.message, details: error.details },
      error.status,
    )
  }

  console.error(`Erreur interne non gérée sur ${c.req.method} ${c.req.path} :`, error)

  return c.json(
    { code: 'internal_error', message: 'Une erreur interne est survenue.', details: {} },
    500,
  )
}
