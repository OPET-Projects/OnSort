import { expect, it } from 'vitest'
import { app } from '../src/main.ts'

it('répond sur la sonde de santé', async () => {
  const response = await app.request('/api/health')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})

it('refuse /api/me sans session', async () => {
  const response = await app.request('/api/me')

  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ code: 'unauthenticated' })
})

it('expose le gestionnaire d’authentification', async () => {
  const response = await app.request('/api/auth/sign-in/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.test' }),
  })

  expect(response.status).toBe(200)
})
