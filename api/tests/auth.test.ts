import { expect, it } from 'vitest'
import { auth } from '../src/auth.ts'
import { prisma } from '../src/db.ts'

it('crée une demande de lien magique pour une adresse inconnue', async () => {
  const response = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.test' }),
    }),
  )

  expect(response.status).toBe(200)

  const verifications = await prisma.verification.findMany()
  expect(verifications).toHaveLength(1)
})

it('ne renvoie pas de session sans cookie', async () => {
  const session = await auth.api.getSession({ headers: new Headers() })
  expect(session).toBeNull()
})
