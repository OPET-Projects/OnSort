import { describe, expect, it } from 'vitest'
import { createMailer } from '../src/lib/mailer.ts'

describe('createMailer sans clé', () => {
  it('écrit le message sur le journal au lieu de l’envoyer', async () => {
    const lines: string[] = []
    const mailer = createMailer({
      apiKey: null,
      from: 'On Sort ? <no-reply@example.test>',
      logger: (line) => lines.push(line),
    })

    await mailer.send({
      to: 'alice@example.test',
      subject: 'Votre lien de connexion',
      text: 'https://example.test/magic?token=abc',
    })

    expect(lines.join('\n')).toContain('alice@example.test')
    expect(lines.join('\n')).toContain('https://example.test/magic?token=abc')
  })

  it('n’écrit que le texte brut, jamais le HTML', async () => {
    // `signIn` prend la première URL de la sortie console pour lien magique : une URL du
    // HTML passant devant ferait échouer toute la suite.
    const lines: string[] = []
    const mailer = createMailer({
      apiKey: null,
      from: 'On Sort ? <no-reply@example.test>',
      logger: (line) => lines.push(line),
    })

    await mailer.send({
      to: 'alice@example.test',
      subject: 'Votre lien de connexion',
      text: 'https://example.test/magic?token=abc',
      html: '<a href="https://example.test/autre">Ouvrir</a>',
    })

    expect(lines.join('\n')).not.toContain('https://example.test/autre')
  })
})
