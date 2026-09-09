import { expect, it } from 'vitest'
import { app } from '../../src/main.ts'
import { signIn } from './auth.ts'

it('ouvre une session utilisable sur /api/me', async () => {
  const headers = await signIn('probe@example.test')

  const response = await app.request('/api/me', { headers })

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ user: { email: 'probe@example.test' } })
})
