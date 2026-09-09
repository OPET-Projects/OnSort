import { afterEach, expect, it, vi } from 'vitest'
import { useMapConfig } from '../src/composables/useMapConfig.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const config = {
  tilesUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap',
}

it('charge la configuration des tuiles', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json(config)),
  )

  const { config: loaded, load } = useMapConfig()
  await load()

  expect(loaded.value?.tilesUrl).toContain('{z}')
  expect(loaded.value?.attribution).toContain('OpenStreetMap')
})

// Une carte indisponible n'est pas une panne de l'application : le reste de l'écran
// continue de fonctionner.
it('signale une configuration indisponible sans lever', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'internal_error', message: 'Panne.', details: {} }, 500)),
  )

  const { config: loaded, error, load } = useMapConfig()
  await load()

  expect(loaded.value).toBeNull()
  expect(error.value).toBe('Panne.')
})
