import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { describeNotification, notificationLink } from '../src/lib/notifications.ts'
import { useNotificationsStore } from '../src/stores/notifications.ts'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const row = (over: Partial<Parameters<typeof describeNotification>[0]> = {}) => ({
  id: 'n1',
  type: 'friend.request',
  eventId: null,
  payload: {},
  readAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...over,
})

it('charge les notifications et le décompte', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ notifications: [row()], unread: 1 })),
  )

  const store = useNotificationsStore()
  await store.refresh()

  expect(store.notifications).toHaveLength(1)
  expect(store.unread).toBe(1)
})

// Une cloche muette n'empêche pas d'utiliser l'application.
it('reste silencieux quand le chargement échoue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'internal_error', message: 'Panne.', details: {} }, 500)),
  )

  const store = useNotificationsStore()
  await store.refresh()

  expect(store.notifications).toEqual([])
  expect(store.loaded).toBe(true)
})

it('recharge après un marquage', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? json({ ok: true }) : json({ notifications: [], unread: 0 }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const store = useNotificationsStore()
  await store.markRead('n1')

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(store.unread).toBe(0)
})

it.each([
  ['friend.request', { name: 'Bob' }, 'Bob'],
  ['friend.accepted', { name: 'Bob' }, 'accepté'],
  ['event.invited', { title: 'Week-end' }, 'Week-end'],
  ['activity.proposed', { title: 'Musée' }, 'vote'],
  ['expense.created', { label: 'Taxi' }, 'Taxi'],
  ['settlement.declared', {}, 'Confirmez'],
  ['settlement.confirmed', {}, 'confirmé'],
])('décrit une notification %s', (type, payload, expected) => {
  expect(describeNotification(row({ type, payload }))).toContain(expected)
})

// Un type ajouté côté API ne doit pas produire une ligne blanche que la pastille compte
// pourtant.
it('rend une phrase neutre sur un type inconnu', () => {
  expect(describeNotification(row({ type: 'quelque.chose' }))).toBe('Il y a du nouveau.')
})

it('se passe d’un payload absent', () => {
  expect(describeNotification(row({ type: 'friend.request', payload: {} }))).toContain('demande')
})

it.each([
  [{ eventId: 'e1' }, '/events/e1'],
  [{ type: 'friend.request' }, '/friends'],
  [{ type: 'group.invited' }, null],
])('rend la cible %s', (over, expected) => {
  expect(notificationLink(row(over))).toBe(expected)
})
