import { afterEach, expect, it, vi } from 'vitest'
import { geocoder } from '../../src/lib/geocoder.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

const rivoli = [{ label: '1 Rue de Rivoli 75001 Paris', lat: 48.8566, lng: 2.3522, score: 0.96 }]

const search = (headers: Headers, query: string) =>
  app.request(`/api/places?q=${encodeURIComponent(query)}`, { headers })

// Sans session, l'application deviendrait un mandataire de géocodage gratuit pour
// n'importe qui, sous notre identité auprès d'un service public.
it('refuse la recherche sans session', async () => {
  expect((await app.request('/api/places?q=rivoli')).status).toBe(401)
})

it('rend les lieux trouvés', async () => {
  const alice = await signIn('alice@example.test')
  vi.spyOn(geocoder, 'search').mockClear().mockResolvedValue(rivoli)

  const response = await search(alice, '1 rue de Rivoli')

  expect(response.status).toBe(200)

  const { places } = (await response.json()) as { places: { label: string; lat: number }[] }
  expect(places).toHaveLength(1)
  expect(places[0]?.label).toBe('1 Rue de Rivoli 75001 Paris')
})

it('refuse une requête absente', async () => {
  const alice = await signIn('alice@example.test')

  const response = await app.request('/api/places', { headers: alice })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'validation_error' })
})

// La règle « une requête de moins de trois caractères n'atteint pas la BAN » vit dans le
// géocodeur, avec l'appel qu'elle protège, et `lib/geocoder.test.ts` la couvre. La route ne
// la réimplémente pas : un contrôle en double finit toujours par diverger. Elle se contente
// de relayer la requête telle quelle.
it('relaie la requête au géocodeur sans la réécrire', async () => {
  const alice = await signIn('alice@example.test')
  const spy = vi.spyOn(geocoder, 'search').mockClear().mockResolvedValue(rivoli)

  await search(alice, '1 rue de Rivoli')

  expect(spy).toHaveBeenCalledWith('1 rue de Rivoli', 5)
})

// Une borne haute sur `limit` : la route relaie un service public gratuit, rien ne doit
// permettre d'en tirer des pages entières à travers nous.
it('refuse une limite hors des bornes', async () => {
  const alice = await signIn('alice@example.test')

  const response = await app.request('/api/places?q=rivoli&limit=500', { headers: alice })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'validation_error' })
})

it('rend une liste vide quand le service ne répond pas', async () => {
  const alice = await signIn('alice@example.test')
  vi.spyOn(geocoder, 'search').mockClear().mockResolvedValue([])

  expect(await (await search(alice, 'zzzzzz')).json()).toEqual({ places: [] })
})

it('rend la configuration de la carte', async () => {
  const alice = await signIn('alice@example.test')

  const response = await app.request('/api/map/config', { headers: alice })

  expect(response.status).toBe(200)

  const body = (await response.json()) as { tilesUrl: string; attribution: string }
  expect(body.tilesUrl).toContain('{z}')
  expect(body.tilesUrl).toContain('{x}')
  expect(body.tilesUrl).toContain('{y}')
  // L'attribution est une condition de la politique d'usage des tuiles, pas un ornement.
  expect(body.attribution).toContain('OpenStreetMap')
})

it('refuse la configuration sans session', async () => {
  expect((await app.request('/api/map/config')).status).toBe(401)
})
