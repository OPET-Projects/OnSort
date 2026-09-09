import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePlaces } from '../src/composables/usePlaces.ts'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

const rivoli = { label: '1 Rue de Rivoli 75001 Paris', lat: 48.8566, lng: 2.3522, score: 0.96 }

it('propose des adresses après le délai', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ places: [rivoli] })),
  )

  const { suggestions, search } = usePlaces()
  search('1 rue de Rivoli')

  await vi.advanceTimersByTimeAsync(400)

  expect(suggestions.value).toHaveLength(1)
})

// Sans délai, taper une adresse de trente caractères produirait trente requêtes.
it('ne lance qu’une requête pour une frappe continue', async () => {
  const fetchMock = vi.fn(async () => json({ places: [rivoli] }))
  vi.stubGlobal('fetch', fetchMock)

  const { search } = usePlaces()
  for (const query of ['1 r', '1 ru', '1 rue', '1 rue d', '1 rue de']) {
    search(query)
    await vi.advanceTimersByTimeAsync(50)
  }
  await vi.advanceTimersByTimeAsync(400)

  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it.each([[''], ['ru']])('n’interroge pas sur « %s »', async (query) => {
  const fetchMock = vi.fn(async () => json({ places: [rivoli] }))
  vi.stubGlobal('fetch', fetchMock)

  const { search } = usePlaces()
  search(query)
  await vi.advanceTimersByTimeAsync(400)

  expect(fetchMock).not.toHaveBeenCalled()
})

it('vide les propositions quand la saisie redevient trop courte', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ places: [rivoli] })),
  )

  const { suggestions, search } = usePlaces()
  search('1 rue de Rivoli')
  await vi.advanceTimersByTimeAsync(400)

  search('ru')

  expect(suggestions.value).toEqual([])
})

it('reste silencieux quand la recherche échoue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('réseau')
    }),
  )

  const { suggestions, searching, search } = usePlaces()
  search('1 rue de Rivoli')
  await vi.advanceTimersByTimeAsync(400)

  expect(suggestions.value).toEqual([])
  expect(searching.value).toBe(false)
})

it('efface tout sur demande', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ places: [rivoli] })),
  )

  const { suggestions, search, clear } = usePlaces()
  search('1 rue de Rivoli')
  await vi.advanceTimersByTimeAsync(400)

  clear()

  expect(suggestions.value).toEqual([])
})
