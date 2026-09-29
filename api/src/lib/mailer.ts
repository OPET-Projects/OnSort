import { Resend } from 'resend'
import { config } from '../config.ts'

export type Mail = {
  to: string
  subject: string
  text: string
  html?: string
}

export type Mailer = {
  send(mail: Mail): Promise<void>
}

// La part de Resend dont le mailer se sert. Injectable, pour tester la branche d'envoi réel
// sans réseau ni bibliothèque de simulation.
type EmailClient = {
  emails: {
    send(payload: {
      from: string
      to: string
      subject: string
      text: string
      html?: string
    }): Promise<{ error: { message: string } | null }>
  }
}

type Options = {
  apiKey: string | null
  from: string
  logger?: (line: string) => void
  client?: EmailClient
}

export function createMailer({ apiKey, from, logger, client }: Options): Mailer {
  if (apiKey === null) {
    return {
      async send(mail) {
        ;(logger ?? console.info)(
          [
            '',
            '─── courriel non envoyé (aucune clé Resend) ───',
            `  de     : ${from}`,
            `  à      : ${mail.to}`,
            `  objet  : ${mail.subject}`,
            '',
            mail.text,
            '───────────────────────────────────────────────',
            '',
          ].join('\n'),
        )
      },
    }
  }

  const resend: EmailClient = client ?? new Resend(apiKey)

  return {
    async send(mail) {
      const { error } = await resend.emails.send({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html === undefined ? {} : { html: mail.html }),
      })

      if (error) {
        throw new Error(`Envoi du courriel échoué : ${error.message}`)
      }
    },
  }
}

export const mailer = createMailer({
  apiKey: config.resendApiKey,
  from: config.mailFrom,
})
