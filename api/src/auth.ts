import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { magicLink } from 'better-auth/plugins'
import { config } from './config.ts'
import { prisma } from './db.ts'
import { displayNameFromEmail } from './lib/identity.ts'
import { mailer } from './lib/mailer.ts'

export const auth = betterAuth({
  appName: 'On Sort ?',
  secret: config.authSecret,
  baseURL: config.authUrl,
  basePath: '/api/auth',
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  trustedOrigins: [config.appUrl],
  // Google rend une adresse déjà vérifiée : l'identité de l'application reste l'adresse, et
  // les invitations, les amis et la règle anti-énumération (conception §4) continuent de
  // porter dessus. Sans clés configurées, aucun fournisseur n'est déclaré et le lien magique
  // reste le seul chemin.
  socialProviders: config.google === null ? {} : { google: config.google },
  databaseHooks: {
    user: {
      create: {
        // Le greffon `magicLink` crée le compte sans nom : aucun formulaire d'inscription
        // n'en collecte. On en dérive un depuis l'adresse, à la source, pour que tous les
        // consommateurs — accueil, liste des participants — en héritent d'un seul coup.
        async before(user) {
          if (user.name.trim() !== '') {
            return
          }

          return { data: { ...user, name: displayNameFromEmail(user.email) } }
        },
      },
    },
  },
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
