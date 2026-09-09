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

it('donne un nom affichable au compte créé par lien magique', async () => {
  const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

  try {
    // Un compte créé par lien magique n'a aucun formulaire d'inscription où saisir un nom.
    // Sans valeur par défaut, il apparaîtrait sans nom dans la liste des participants d'un
    // événement — exactement le tiers que la démonstration de M1 fait rejoindre.
    await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'jean.dupont@example.test' }),
      }),
    )

    const logged = consoleInfoSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    const link = logged.match(/https?:\/\/\S+/)?.[0]

    if (link === undefined) {
      throw new Error(`Lien magique introuvable dans la sortie console :\n${logged}`)
    }

    await auth.handler(new Request(link))

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'jean.dupont@example.test' },
    })
    expect(user.name).toBe('Jean Dupont')
  } finally {
    consoleInfoSpy.mockRestore()
  }
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

// La limite de débit de Better Auth est par adresse IP. Derrière nginx, l'API ne voit que
// l'adresse du mandataire : sans en-tête de confiance déclarée, la bibliothèque n'en résout
// aucune et retombe sur un seau unique partagé par tous les visiteurs.
it("résout l'adresse du client depuis l'en-tête posé par le mandataire", () => {
  expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(['x-real-ip'])
})
