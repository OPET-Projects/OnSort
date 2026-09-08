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
})
