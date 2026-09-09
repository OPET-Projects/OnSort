import { afterEach, expect, it, vi } from 'vitest'
import { useFriends } from '../src/composables/useFriends.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const body = {
  friends: [{ userId: 'u2', name: 'Bob', since: '2026-10-01T10:00:00.000Z' }],
  received: [
    { id: 'r1', from: { userId: 'u3', name: 'Carla' }, createdAt: '2026-10-01T10:00:00.000Z' },
  ],
  sent: [],
}

it('charge amis et demandes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json(body)),
  )

  const { state, friends, received, reload } = useFriends()
  await reload()

  expect(state.value).toBe('ready')
  expect(friends.value).toHaveLength(1)
  expect(received.value).toHaveLength(1)
})

it('passe en erreur quand le chargement échoue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'unauthorized', message: 'Non.', details: {} }, 401)),
  )

  const { state, error, reload } = useFriends()
  await reload()

  expect(state.value).toBe('error')
  expect(error.value).toBe('Non.')
})

// L'interface ne peut rien affirmer de plus que « quelque chose est parti » : la réponse de
// l'API est identique que le compte existe ou non (conception §4).
it('signale un envoi sans dire si le compte existe', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? json({ status: 'sent' }) : json(body),
  )
  vi.stubGlobal('fetch', fetchMock)

  const { ask, requestSent } = useFriends()
  await ask('carla@example.test')

  expect(requestSent.value).toBe(true)
})

it.each([
  ['accept', 'accept'],
  ['decline', 'decline'],
])('recharge après un %s', async (_label, action) => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? json({ ok: true }) : json(body),
  )
  vi.stubGlobal('fetch', fetchMock)

  const composable = useFriends()
  await (action === 'accept' ? composable.accept('r1') : composable.decline('r1'))

  expect(fetchMock).toHaveBeenCalledTimes(2)
  const called = String(fetchMock.mock.calls[0]?.[0])
  expect(called).toContain(action)
})
