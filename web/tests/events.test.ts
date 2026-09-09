import { afterEach, expect, it, vi } from 'vitest'
import { useEvents } from '../src/composables/useEvents.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(handler: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(handler))
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

it('passe à « empty » quand la liste est vide', async () => {
  stubFetch(async () => json({ events: [] }))

  const { state, reload } = useEvents()
  await reload()

  expect(state.value).toBe('empty')
})

it('passe à « ready » avec les événements', async () => {
  stubFetch(async () =>
    json({ events: [{ id: 'e1', title: 'Sortie', startsAt: '', endsAt: '', status: 'draft' }] }),
  )

  const { state, events, reload } = useEvents()
  await reload()

  expect(state.value).toBe('ready')
  expect(events.value[0]?.title).toBe('Sortie')
})

it('passe à « error » quand l’API échoue', async () => {
  stubFetch(async () => {
    throw new Error('réseau coupé')
  })

  const { state, reload } = useEvents()
  await reload()

  expect(state.value).toBe('error')
})
