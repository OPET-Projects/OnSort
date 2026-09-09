// Appel JSON vers l'API, sur la même origine (le mandataire de Vite route `/api`).
// Une réponse d'erreur suit la forme uniforme `{ code, message, details }` : elle est
// relevée en `ApiFetchError` porteuse du `code`, que les vues peuvent distinguer.

export type ApiErrorBody = {
  code: string
  message: string
  details: Record<string, unknown>
}

export class ApiFetchError extends Error {
  readonly code: string

  constructor(body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiFetchError'
    this.code = body.code
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })

  const text = await response.text()
  const body = text.length > 0 ? JSON.parse(text) : null

  if (!response.ok) {
    throw new ApiFetchError(
      body ?? { code: 'unknown', message: 'Une erreur est survenue.', details: {} },
    )
  }

  return body as T
}
