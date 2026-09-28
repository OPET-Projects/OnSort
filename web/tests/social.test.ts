import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthProviders } from '../src/composables/useAuthProviders.ts'
import { useSessionStore } from '../src/stores/session.ts'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// Better Auth résout un `callbackURL` relatif contre sa propre `baseURL`, pas contre le
// front : en développement, les deux origines diffèrent.
it('envoie une cible de reprise absolue et rend l’URL du fournisseur', async () => {
  const fetchMock = vi.fn(async () => json({ url: 'https://accounts.google.com/o/oauth2/v2/auth' }))
  vi.stubGlobal('fetch', fetchMock)

  const session = useSessionStore()
  const url = await session.startGoogleSignIn('/invite/abc')

  expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth')
  const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(path).toBe('/api/auth/sign-in/social')
  expect(JSON.parse(String(init.body))).toEqual({
    provider: 'google',
    callbackURL: `${window.location.origin}/invite/abc`,
  })
})

it('refuse une réponse sans URL plutôt que de naviguer nulle part', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({})),
  )

  const session = useSessionStore()

  await expect(session.startGoogleSignIn()).rejects.toThrow(/Google/)
})

it('remonte un refus du serveur', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'oops', message: 'non', details: {} }, 500)),
  )

  const session = useSessionStore()

  await expect(session.startGoogleSignIn()).rejects.toThrow(/Google/)
})

it('annonce Google quand le serveur le déclare', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ google: true })),
  )

  const { google } = useAuthProviders()
  await vi.waitFor(() => expect(google.value).toBe(true))
})

// API injoignable : pas de bouton. Un bouton mort mènerait sur une erreur du fournisseur.
it('n’annonce aucun fournisseur quand l’API ne répond pas', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('réseau coupé')
    }),
  )

  const { google } = useAuthProviders()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(google.value).toBe(false)
})
