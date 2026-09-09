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
    ipAddress: {
      // Better Auth limite `/sign-in/*` à trois requêtes par dix secondes en production,
      // **par adresse IP**. Derrière un mandataire, il ne voit que celle du mandataire :
      // sans cette ligne il n'en résout aucune et retombe sur « un seul seau partagé par
      // chemin » — trois demandes de lien magique dans le monde entier, et plus personne ne
      // se connecte pendant dix secondes.
      //
      // `x-real-ip` plutôt que `x-forwarded-for` : nginx **écrase** le premier avec
      // `$remote_addr`, alors que le second est une liste à laquelle le client peut
      // préfixer ce qu'il veut. Faire confiance à une valeur que l'appelant contrôle
      // rendrait la limite contournable en une en-tête.
      ipAddressHeaders: ['x-real-ip'],
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
