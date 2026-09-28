# syntax=docker/dockerfile:1

# Deux images sortent de ce fichier : `api`, qui sert l'API Hono, et `web`, un Caddy portant
# le front bâti et servant de façade HTTPS. Elles partagent leurs étapes de construction,
# parce que le front importe les types de l'API (`AppType`) : les deux se compilent ensemble
# ou pas du tout.

FROM node:24.20.0-slim AS deps
WORKDIR /app

# Les manifestes seuls d'abord : tant qu'ils ne changent pas, Docker réutilise la couche
# d'installation, qui est de loin la plus longue.
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/

RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .

# Le client Prisma est généré, jamais versionné : `api/src/generated/` est dans .gitignore.
RUN npm run db:generate
RUN npm run build --workspace api
RUN npm run build --workspace web

# --- Image de l'API ---------------------------------------------------------------------
FROM node:24.20.0-slim AS api
ENV NODE_ENV=production
WORKDIR /app

# `node_modules` est repris tel quel, dépendances de développement comprises. C'est
# délibéré : la CLI Prisma est une dépendance de développement, et le conteneur doit
# pouvoir appliquer les migrations et jouer le jeu de données. Les élaguer économiserait
# quelques dizaines de mégaoctets au prix d'une image incapable de migrer sa propre base.
# Un seul `node_modules`, à la racine : les workspaces npm y remontent les dépendances des
# deux espaces, et `api/node_modules` n'existe pas.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/api/package.json ./api/package.json
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/prisma ./api/prisma
COPY --from=build /app/api/prisma.config.ts ./api/prisma.config.ts

WORKDIR /app/api

# `node --env-file` n'est pas utilisé ici : les variables viennent de l'environnement du
# conteneur, et un fichier `.env` absent ferait échouer le démarrage.
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

# --- Image du front et de la façade -------------------------------------------------------
FROM caddy:2.10-alpine AS web

# Le front et l'API sont servis sur la **même origine** : `EventSource` ne permet pas
# d'envoyer d'en-têtes, l'authentification du flux SSE passe donc par le cookie de session,
# ce qui l'impose (conception §5.2).
COPY --from=build /app/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
