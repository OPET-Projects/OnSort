import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSessionStore } from '../src/stores/session.ts'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('passe en anonyme quand la session est refusée', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 401 })),
  )

  const store = useSessionStore()
  await store.fetchSession()

  expect(store.status).toBe('anonymous')
  expect(store.user).toBeNull()
})

it('retient l’utilisateur quand la session est valide', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ user: { id: 'u1', email: 'alice@example.test', name: 'Alice' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ),
  )

  const store = useSessionStore()
  await store.fetchSession()

  expect(store.status).toBe('authenticated')
  expect(store.user?.email).toBe('alice@example.test')
})

it('renvoie le lien magique vers l’origine du front, pas celle de l’API', async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)

  const store = useSessionStore()
  await store.requestMagicLink('bob@example.test', '/invite/jeton')

  const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
  expect(body.callbackURL).toBe(`${window.location.origin}/invite/jeton`)
})

it('passe en anonyme sans propager d’exception quand l’API est injoignable', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network error')
    }),
  )

  const store = useSessionStore()

  await expect(store.fetchSession()).resolves.toBeUndefined()
  expect(store.status).toBe('anonymous')
  expect(store.user).toBeNull()
})
