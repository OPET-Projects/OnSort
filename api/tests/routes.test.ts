import { Hono } from 'hono'
import { expect, it, vi } from 'vitest'
import { config } from '../src/config.ts'
import { renderApiError } from '../src/lib/http.ts'
import { app } from '../src/main.ts'

it('répond sur la sonde de santé', async () => {
  const response = await app.request('/api/health')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})

it('refuse /api/me sans session', async () => {
  const response = await app.request('/api/me')

  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({
    code: 'unauthenticated',
    message: 'Authentification requise',
    details: {},
  })
})

// Le front s'appuie là-dessus pour afficher — ou taire — le bouton Google : un bouton
// proposé sans clés mènerait droit sur une erreur du fournisseur.
//
// Les deux états sont posés explicitement plutôt que lus dans l'environnement : la suite
// charge le `.env` du développeur, où les clés peuvent être présentes comme absentes.
it.each([
  ['configuré', { clientId: 'un-identifiant', clientSecret: 'un-secret' }, true],
  ['absent', null, false],
])('annonce Google %s, sans session', async (_state, credentials, expected) => {
  const previous = config.google
  config.google = credentials

  try {
    const response = await app.request('/api/auth-providers')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ google: expected })
  } finally {
    config.google = previous
  }
})

it('expose le gestionnaire d’authentification', async () => {
  const response = await app.request('/api/auth/sign-in/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.test' }),
  })

  expect(response.status).toBe(200)
})

it('convertit une exception non gérée en 500 à forme uniforme, sans exposer de détail interne', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    // Une instance Hono distincte, dédiée à ce test : `main.ts` ne doit exposer aucune
    // route qui lève volontairement. Elle réutilise `renderApiError`, le même
    // gestionnaire que celui monté sur `app`, pour vérifier son comportement réel plutôt
    // qu'une copie qui pourrait diverger.
    const failingApp = new Hono()
      .get('/boom', () => {
        throw new Error('secret interne — ne doit jamais atteindre le client')
      })
      .onError(renderApiError)

    const response = await failingApp.request('/boom')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: 'internal_error',
      message: 'Une erreur interne est survenue.',
      details: {},
    })

    const loggedOutput = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(loggedOutput).toContain('secret interne')
  } finally {
    consoleErrorSpy.mockRestore()
  }
})
