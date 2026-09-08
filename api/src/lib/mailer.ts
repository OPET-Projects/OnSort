import { Resend } from 'resend'
import { config } from '../config.ts'

export type Mail = {
  to: string
  subject: string
  text: string
}

export type Mailer = {
  send(mail: Mail): Promise<void>
}

type Options = {
  apiKey: string | null
  from: string
  logger?: (line: string) => void
}

export function createMailer({ apiKey, from, logger = console.info }: Options): Mailer {
  if (apiKey === null) {
    return {
      async send(mail) {
        logger(
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

  const resend = new Resend(apiKey)

  return {
    async send(mail) {
      const { error } = await resend.emails.send({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
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
