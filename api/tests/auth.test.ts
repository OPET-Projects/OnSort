import { expect, it, vi } from 'vitest'
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

it('mène une connexion complète, du lien magique à la session', async () => {
  const consoleInfoSpy = vi.spyOn(console, 'info')

  try {
    const email = 'bob@example.test'

    const signInResponse = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    )
    expect(signInResponse.status).toBe(200)

    // Le lien magique n'est jamais deviné : il est extrait du courriel réellement journalisé
    // par le mailer (aucune clé Resend en test), pour vérifier le contrat que Better Auth
    // produit lui-même plutôt qu'un chemin d'API supposé.
    const loggedOutput = consoleInfoSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    const magicLinkMatch = loggedOutput.match(/https?:\/\/\S+/)

    if (magicLinkMatch === null) {
      throw new Error(`Lien magique introuvable dans la sortie console :\n${loggedOutput}`)
    }

    const magicLinkUrl = magicLinkMatch[0]

    const verifyResponse = await auth.handler(new Request(magicLinkUrl))
    expect(verifyResponse.status).toBeGreaterThanOrEqual(200)
    expect(verifyResponse.status).toBeLessThan(400)

    const user = await prisma.user.findUnique({ where: { email } })
    if (user === null) {
      throw new Error(`Aucun utilisateur créé pour ${email} après consommation du lien`)
    }
    expect(user.email).toBe(email)

    const sessions = await prisma.session.findMany({ where: { userId: user.id } })
    expect(sessions.length).toBeGreaterThan(0)
  } finally {
    consoleInfoSpy.mockRestore()
  }
})
