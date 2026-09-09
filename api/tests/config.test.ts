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
