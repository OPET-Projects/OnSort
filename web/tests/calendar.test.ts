import { afterEach, expect, it, vi } from 'vitest'
import { useCalendar } from '../src/composables/useCalendar.ts'
import { useGroup } from '../src/composables/useGroup.ts'
import { useGroups } from '../src/composables/useGroups.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const row = {
  id: 'u1',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-10-02T00:00:00.000Z',
  label: 'Congés',
}

it('charge les indisponibilités', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ unavailability: [row] })),
  )

  const { state, unavailability, reload } = useCalendar()
  await reload()

  expect(state.value).toBe('ready')
  expect(unavailability.value).toHaveLength(1)
})

it('passe à « empty » sans indisponibilité', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ unavailability: [] })),
  )

  const { state, reload } = useCalendar()
  await reload()

  expect(state.value).toBe('empty')
})

it('recharge après un ajout', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? json({}, 201) : json({ unavailability: [row] }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const { add } = useCalendar()
  await add({ startsAt: row.startsAt, endsAt: row.endsAt })

  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('recharge après une suppression', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'DELETE' ? json({ ok: true }) : json({ unavailability: [] }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const { remove } = useCalendar()
  await remove('u1')

  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('passe en erreur quand le chargement échoue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'unauthorized', message: 'Non.', details: {} }, 401)),
  )

  const { state, error, reload } = useCalendar()
  await reload()

  expect(state.value).toBe('error')
  expect(error.value).toBe('Non.')
})

it('liste les groupes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({ groups: [{ id: 'g1', name: 'Copains', role: 'admin', memberCount: 3 }] }),
    ),
  )

  const { state, groups, reload } = useGroups()
  await reload()

  expect(state.value).toBe('ready')
  expect(groups.value[0]?.memberCount).toBe(3)
})

it('charge la fiche du groupe et son calendrier en une passe', async () => {
  const detail = {
    group: {
      id: 'g1',
      name: 'Copains',
      createdBy: 'x',
      members: [{ userId: 'u1', name: 'Alice', role: 'admin', joinedAt: '2026-01-01' }],
      viewer: { role: 'admin' },
    },
  }
  const overlay = {
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-10-30T00:00:00.000Z',
    busy: [],
    free: [{ startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-10-30T00:00:00.000Z' }],
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.includes('/calendar') ? json(overlay) : json(detail))),
  )

  const { state, group, calendar, reload } = useGroup('g1')
  await reload()

  expect(state.value).toBe('ready')
  expect(group.value?.name).toBe('Copains')
  expect(calendar.value?.free).toHaveLength(1)
})

// La fenêtre est bornée côté API à 90 jours ; le front en demande 30 par défaut, et une
// durée minimale de deux heures pour écarter les miettes.
it('demande une fenêtre bornée et une durée minimale', async () => {
  const fetchMock = vi.fn(async (url: string) =>
    url.includes('/calendar')
      ? json({ from: '', to: '', busy: [], free: [] })
      : json({
          group: { id: 'g1', name: 'G', createdBy: 'x', members: [], viewer: { role: 'member' } },
        }),
  )
  vi.stubGlobal('fetch', fetchMock)

  const { reload } = useGroup('g1')
  await reload()

  const calendarCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/calendar'))
  const query = new URL(String(calendarCall?.[0]), 'http://x').searchParams

  expect(query.get('minimumMinutes')).toBe('120')
  const spanDays =
    (Date.parse(String(query.get('to'))) - Date.parse(String(query.get('from')))) / 86_400_000
  expect(Math.round(spanDays)).toBe(30)
})

it('signale une invitation envoyée sans dire si le compte existe', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ status: 'sent' })),
  )

  const { invite, inviteSent } = useGroup('g1')
  await invite('carla@example.test')

  expect(inviteSent.value).toBe(true)
})
