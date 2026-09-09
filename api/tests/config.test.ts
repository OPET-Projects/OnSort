import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'

const valid = {
  DATABASE_URL: 'postgresql://onsort:onsort@localhost:5432/onsort',
  BETTER_AUTH_SECRET: 'un-secret-de-test-suffisamment-long',
  BETTER_AUTH_URL: 'http://localhost:3000',
  APP_URL: 'http://localhost:5173',
  MAIL_FROM: 'On Sort ? <no-reply@example.test>',
}

describe('loadConfig', () => {
  it('lit une configuration complète', () => {
    const config = loadConfig(valid)
    expect(config).toEqual({
      databaseUrl: valid.DATABASE_URL,
      port: 3000,
      appUrl: valid.APP_URL,
      authSecret: valid.BETTER_AUTH_SECRET,
      authUrl: valid.BETTER_AUTH_URL,
      mapTilesUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      mapTilesAttribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      resendApiKey: null,
      mailFrom: valid.MAIL_FROM,
      isProduction: false,
    })
  })

  it('nomme la variable manquante', () => {
    const incomplete = { ...valid, BETTER_AUTH_SECRET: undefined }
    expect(() => loadConfig(incomplete)).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('refuse un secret trop court', () => {
    expect(() => loadConfig({ ...valid, BETTER_AUTH_SECRET: 'court' })).toThrow(
      /BETTER_AUTH_SECRET/,
    )
  })

  it('traite une clé Resend vide comme absente', () => {
    expect(loadConfig({ ...valid, RESEND_API_KEY: '' }).resendApiKey).toBeNull()
  })
})

// `.default()` de zod ne couvre que l'absence : une variable laissée vide dans un fichier
// d'exemple aurait sinon empêché le démarrage.
it.each([[undefined], ['']])('retombe sur OpenStreetMap quand MAP_TILES_URL vaut %s', (value) => {
  const config = loadConfig({ ...valid, ...(value === undefined ? {} : { MAP_TILES_URL: value }) })

  expect(config.mapTilesUrl).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
  expect(config.mapTilesAttribution).toContain('OpenStreetMap')
})

it('accepte un fournisseur de tuiles avec son attribution', () => {
  const config = loadConfig({
    ...valid,
    MAP_TILES_URL: 'https://tiles.exemple.fr/{z}/{x}/{y}.png?key=abc',
    MAP_TILES_ATTRIBUTION: '© Exemple',
  })

  expect(config.mapTilesUrl).toContain('tiles.exemple.fr')
  expect(config.mapTilesAttribution).toBe('© Exemple')
})

// Servir les tuiles d'un fournisseur sous l'attribution d'un autre serait faux : l'attribution
// par défaut ne suit que la source par défaut.
it("n'attribue pas OpenStreetMap aux tuiles d'un autre fournisseur", () => {
  const config = loadConfig({ ...valid, MAP_TILES_URL: 'https://tiles.exemple.fr/{z}/{x}/{y}.png' })

  expect(config.mapTilesAttribution).toBe('')
})
