import { vi } from 'vitest'
import { auth } from '../../src/auth.ts'

// Mène le tour complet du lien magique et renvoie des en-têtes porteuses du cookie de
// session, prêtes pour `app.request()`. Better Auth crée le compte au premier passage
// (cf. tests/auth.test.ts). Le lien n'est jamais deviné : il est extrait du courriel
// réellement journalisé par le mailer (aucune clé Resend en test).
export async function signIn(email: string): Promise<Headers> {
  const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

  try {
    await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    )

    const logged = consoleInfoSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    const link = logged.match(/https?:\/\/\S+/)?.[0]

    if (link === undefined) {
      throw new Error(`Lien magique introuvable dans la sortie console :\n${logged}`)
    }

    const verifyResponse = await auth.handler(new Request(link))
    const setCookie = verifyResponse.headers.get('set-cookie')

    if (setCookie === null) {
      throw new Error('Aucun cookie de session renvoyé à la vérification du lien magique')
    }

    const headers = new Headers()
    headers.set('cookie', setCookie.split(';')[0] ?? '')
    return headers
  } finally {
    consoleInfoSpy.mockRestore()
  }
}
