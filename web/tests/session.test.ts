import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { useSessionStore } from '../src/stores/session.ts'

beforeEach(() => {
  setActivePinia(createPinia())
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
