import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { magicLink } from 'better-auth/plugins'
import { config } from './config.ts'
import { prisma } from './db.ts'
import { mailer } from './lib/mailer.ts'

export const auth = betterAuth({
  appName: 'On Sort ?',
  secret: config.authSecret,
  baseURL: config.authUrl,
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  trustedOrigins: [config.appUrl],
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: config.isProduction,
      httpOnly: true,
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      async sendMagicLink({ email, url }) {
        await mailer.send({
          to: email,
          subject: 'Votre lien de connexion à On Sort ?',
          text: [
            'Bonjour,',
            '',
            'Voici votre lien de connexion. Il expire dans quinze minutes :',
            url,
            '',
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
          ].join('\n'),
        })
      },
    }),
  ],
})
