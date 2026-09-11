import { afterEach, expect, it, vi } from 'vitest'
import { useActivities } from '../src/composables/useActivities.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const activity = {
  id: 'a1',
  title: 'Musée',
  kind: '',
  address: '',
  startsAt: null,
  endsAt: null,
  position: 0,
  status: 'proposed',
  proposedBy: { participantId: 'p1', name: 'Alice' },
  tally: { for: 1, against: 0 },
  myVote: null,
}

it('passe à « empty » quand le programme est vide', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ activities: [] })),
  )

  const { state, reload } = useActivities('e1')
  await reload()

  expect(state.value).toBe('empty')
})

it('passe à « ready » avec les activités', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ activities: [activity] })),
  )

  const { state, activities, reload } = useActivities('e1')
  await reload()

  expect(state.value).toBe('ready')
  expect(activities.value[0]?.title).toBe('Musée')
})

it('passe à « error » quand l’API échoue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('réseau coupé')
    }),
  )

  const { state, reload } = useActivities('e1')
  await reload()

  expect(state.value).toBe('error')
})

it('applique le décompte renvoyé par un vote sans recharger la liste', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return json({ for: 2, against: 1 })
    return json({ activities: [activity] })
  })
  vi.stubGlobal('fetch', fetchMock)

  const { activities, reload, vote } = useActivities('e1')
  await reload()
  fetchMock.mockClear()

  await vote('a1', 'for')

  // Un seul appel : celui du vote. Recharger la liste après chaque voix ferait battre
  // l'écran pour rien, alors que la réponse porte déjà le décompte à jour.
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(activities.value[0]?.tally).toEqual({ for: 2, against: 1 })
  expect(activities.value[0]?.myVote).toBe('for')
})

it('applique un décompte reçu du flux temps réel', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ activities: [activity] })),
  )

  const { activities, reload, applyTally } = useActivities('e1')
  await reload()

  applyTally('a1', { for: 5, against: 3 })

  expect(activities.value[0]?.tally).toEqual({ for: 5, against: 3 })
})

it('ignore un décompte visant une activité inconnue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ activities: [activity] })),
  )

  const { activities, reload, applyTally } = useActivities('e1')
  await reload()

  expect(() => applyTally('inconnue', { for: 9, against: 9 })).not.toThrow()
  expect(activities.value[0]?.tally).toEqual({ for: 1, against: 0 })
})

// --- réordonnancement et annulation (M7) --------------------------------------------------

const programme = [
  { ...activity, id: 'a1', title: 'Musée', position: 0 },
  { ...activity, id: 'a2', title: 'Restaurant', position: 1 },
  { ...activity, id: 'a3', title: 'Concert', position: 2 },
]

async function loaded(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const composable = useActivities('e1')
  await composable.reload()
  return composable
}

it('envoie la liste complète des identifiants dans le nouvel ordre', async () => {
  const fetchMock = vi.fn(async () => json({ activities: programme }))
  const { move } = await loaded(fetchMock)

  await move('a3', -1)

  const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
  expect(url).toBe('/api/events/e1/activities/order')
  expect(init.method).toBe('PATCH')
  expect(JSON.parse(String(init.body))).toEqual({ activityIds: ['a1', 'a3', 'a2'] })
})

it('descend une activité', async () => {
  const fetchMock = vi.fn(async () => json({ activities: programme }))
  const { move } = await loaded(fetchMock)

  await move('a1', 1)

  const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
  expect(JSON.parse(String(init.body))).toEqual({ activityIds: ['a2', 'a1', 'a3'] })
})

// Aux extrémités, il n'y a rien à échanger : une requête partirait pour reposer l'ordre
// existant, et l'API la refuserait ou ne changerait rien.
it('ne demande rien aux extrémités', async () => {
  const fetchMock = vi.fn(async () => json({ activities: programme }))
  const { move } = await loaded(fetchMock)

  await move('a1', -1)
  await move('a3', 1)

  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('annule une activité puis la rétablit', async () => {
  const fetchMock = vi.fn(async () => json({ activities: programme }))
  const { cancel } = await loaded(fetchMock)

  await cancel('a2', true)

  const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
  expect(url).toBe('/api/activities/a2/cancel')
  expect(init.method).toBe('POST')
  expect(JSON.parse(String(init.body))).toEqual({ cancelled: true })

  await cancel('a2', false)

  const [, restore] = fetchMock.mock.calls[3] as [string, RequestInit]
  expect(JSON.parse(String(restore.body))).toEqual({ cancelled: false })
})
