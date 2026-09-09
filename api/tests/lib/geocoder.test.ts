import { afterEach, expect, it, vi } from 'vitest'
import { geocoder } from '../../src/lib/geocoder.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const banBody = {
  features: [
    {
      geometry: { coordinates: [2.3522, 48.8566] },
      properties: { label: '1 Rue de Rivoli 75001 Paris', score: 0.96 },
    },
  ],
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

it('interroge la BAN et rend les points', async () => {
  const fetchMock = vi.fn(async () => ok(banBody))
  vi.stubGlobal('fetch', fetchMock)

  const places = await geocoder.search('1 rue de Rivoli')

  expect(places).toHaveLength(1)
  expect(places[0]?.lat).toBeCloseTo(48.8566)

  const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
  expect(url.hostname).toBe('api-adresse.data.gouv.fr')
  expect(url.searchParams.get('q')).toBe('1 rue de Rivoli')
  expect(url.searchParams.get('limit')).toBe('5')
})

// La BAN rejette les requêtes trop courtes, et l'autocomplétion frappe à chaque touche :
// les envoyer serait du bruit pour un service public gratuit.
it.each([[''], ['  '], ['ru']])('ne part pas sur la requête « %s »', async (query) => {
  const fetchMock = vi.fn(async () => ok(banBody))
  vi.stubGlobal('fetch', fetchMock)

  expect(await geocoder.search(query)).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
})

it('respecte la limite demandée', async () => {
  const fetchMock = vi.fn(async () => ok(banBody))
  vi.stubGlobal('fetch', fetchMock)

  await geocoder.search('1 rue de Rivoli', 1)

  const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
  expect(url.searchParams.get('limit')).toBe('1')
})

// Un service tiers indisponible ne doit jamais faire échouer l'appelant : une adresse non
// géocodée reste une adresse valide.
it.each([[500], [429], [400]])('rend une liste vide sur un statut %s', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status })),
  )

  expect(await geocoder.search('1 rue de Rivoli')).toEqual([])
})

it('rend une liste vide quand la requête échoue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('réseau injoignable')
    }),
  )
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  expect(await geocoder.search('1 rue de Rivoli')).toEqual([])
})

it('rend une liste vide sur un corps illisible', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<html>panne</html>', { status: 200 })),
  )
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  expect(await geocoder.search('1 rue de Rivoli')).toEqual([])
})

// Les services publics demandent qu'un appelant s'identifie.
it("s'identifie auprès du service", async () => {
  const fetchMock = vi.fn(async () => ok(banBody))
  vi.stubGlobal('fetch', fetchMock)

  await geocoder.search('1 rue de Rivoli')

  const init = fetchMock.mock.calls[0]?.[1] as RequestInit
  expect(String((init.headers as Record<string, string>)['user-agent'])).toContain('On Sort')
})

// Sans délai maximal, une BAN lente bloquerait la saisie d'une activité.
it('borne son attente', async () => {
  const fetchMock = vi.fn(async () => ok(banBody))
  vi.stubGlobal('fetch', fetchMock)

  await geocoder.search('1 rue de Rivoli')

  const init = fetchMock.mock.calls[0]?.[1] as RequestInit
  expect(init.signal).toBeInstanceOf(AbortSignal)
})
