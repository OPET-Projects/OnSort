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

describe('createMailer avec une clé', () => {
  // Un client qui a la forme de Resend, injecté : la branche d'envoi réel se teste sans
  // réseau ni bibliothèque de simulation.
  function fakeClient(result: { error: { message: string } | null }) {
    const sent: unknown[] = []
    return {
      sent,
      client: {
        emails: {
          async send(payload: unknown) {
            sent.push(payload)
            return result
          },
        },
      },
    }
  }

  it('transmet l’expéditeur, le destinataire, l’objet, le texte et le HTML', async () => {
    const { sent, client } = fakeClient({ error: null })
    const mailer = createMailer({ apiKey: 're_test', from: 'On Sort ? <no-reply@x.test>', client })

    await mailer.send({
      to: 'alice@example.test',
      subject: 'Objet',
      text: 'Texte',
      html: '<p>HTML</p>',
    })

    expect(sent).toEqual([
      {
        from: 'On Sort ? <no-reply@x.test>',
        to: 'alice@example.test',
        subject: 'Objet',
        text: 'Texte',
        html: '<p>HTML</p>',
      },
    ])
  })

  it('omet le HTML quand il n’y en a pas', async () => {
    const { sent, client } = fakeClient({ error: null })
    const mailer = createMailer({ apiKey: 're_test', from: 'x@x.test', client })

    await mailer.send({ to: 'alice@example.test', subject: 'Objet', text: 'Texte' })

    expect(sent[0]).not.toHaveProperty('html')
  })

  it('lève une erreur lisible quand le fournisseur refuse', async () => {
    const { client } = fakeClient({ error: { message: 'domain not verified' } })
    const mailer = createMailer({ apiKey: 're_test', from: 'x@x.test', client })

    await expect(
      mailer.send({ to: 'alice@example.test', subject: 'Objet', text: 'Texte' }),
    ).rejects.toThrow('Envoi du courriel échoué : domain not verified')
  })
})
