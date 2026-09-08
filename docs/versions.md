# Versions et compatibilité

Relevé du 8 septembre 2026. Toutes les versions ont été vérifiées sur les registres puis
**éprouvées par une installation réelle** : `npm ci`, `biome ci`, `prisma generate`,
`vue-tsc --noEmit`, `tsc`, `vitest run` et la construction du front passent.

## 1. Principe

Versions **épinglées à l'exact**, sans `^` ni `~`, fichier de verrouillage versionné. Sur un
projet à plusieurs, une plage souple signifie que deux machines n'installent pas la même
chose et que le défaut n'apparaît que chez une personne.

Critère de choix : la dernière version stable **acceptée par les contraintes déclarées des
autres paquets**. Plusieurs de ces contraintes ne sont pas des avertissements — elles font
échouer l'installation.

## 2. Runtimes

| | Version | Rôle |
|---|---|---|
| Node.js | 24.20.0 (*Krypton*, LTS) | API et outillage front |
| PostgreSQL | 17 | Base de données (`postgres:17` en conteneur) |

Node 26.8.1 existe mais relève de la ligne *Current*, pas LTS.

La version est fixée par `.nvmrc`, que la CI lit via `node-version-file`.

## 3. Organisation

Monorepo en `npm workspaces`, deux paquets :

```
on-sort/
├─ package.json      workspaces, Biome, scripts transverses
├─ api/              Hono + Prisma
└─ web/              Vue + Vite
```

`web` déclare `api` en dépendance de développement (`"api": "*"`), ce qui permet d'importer
le type du routeur directement :

```ts
import type { AppType } from 'api'
```

Le typage bout-en-bout est donc **structurel** : il ne repose sur aucun alias de chemin,
aucune carte d'import et aucune génération de code. Une version précédente de ce document
décrivait un montage à base de carte d'import Deno et exigeait des versions identiques de
`hono` et `zod` des deux côtés ; l'abandon de Deno rend tout cela caduc.

## 4. Dépendances

### 4.1 Racine

| Paquet | Version |
|---|---|
| `@biomejs/biome` | 2.5.12 |

Biome remplace ESLint et Prettier : un outil, une configuration.

### 4.2 `api/`

| Paquet | Version | |
|---|---|---|
| `hono` | 4.13.7 | |
| `@hono/node-server` | 2.1.1 | adaptateur Node |
| `@hono/zod-validator` | 0.9.1 | |
| `zod` | 4.5.4 | |
| `@prisma/client` | 7.10.0 | |
| `@prisma/adapter-pg` | 7.10.0 | requis par Prisma 7, voir 6.1 |
| `pg` | 8.23.0 | pilote de l'adaptateur |
| `better-auth` | 1.7.3 | |
| `resend` | 6.26.0 | |
| `prisma` | 7.10.0 | développement |
| `tsx` | 4.23.13 | développement |
| `typescript` | 6.0.3 | développement |
| `vitest` | 4.1.11 | développement |
| `@vitest/coverage-v8` | 4.1.11 | développement |
| `@types/node` | 24.13.3 | développement, ligne 24 pour correspondre au runtime |
| `@types/pg` | 8.23.1 | développement |

### 4.3 `web/`

| Paquet | Version | |
|---|---|---|
| `vue` | 3.5.42 | |
| `vue-router` | 5.3.1 | |
| `pinia` | 4.0.3 | |
| `@vue/devtools-api` | 8.2.1 | peer de Pinia, déclaré explicitement |
| `leaflet` | 1.9.4 | |
| `vite` | 8.2.2 | développement |
| `@vitejs/plugin-vue` | 6.0.8 | développement |
| `tailwindcss` | 4.3.3 | développement |
| `@tailwindcss/vite` | 4.3.3 | doit suivre `tailwindcss` à l'identique |
| `typescript` | 6.0.3 | développement |
| `vue-tsc` | 3.3.11 | développement |
| `vitest` | 4.1.11 | développement |
| `@vue/test-utils` | 2.5.0 | développement |
| `happy-dom` | 20.14.0 | environnement DOM des tests |
| `@types/leaflet` | 1.9.22 | développement |

## 5. Contraintes qui déterminent ces versions

| Contrainte déclarée | Conséquence | Gravité |
|---|---|---|
| `better-auth@1.7.3` : `vitest ^2 \|\| ^3 \|\| ^4` | **Vitest 4.1.11**, pas 5.0.0 | **`npm install` échoue** |
| `better-auth@1.7.3` : `prisma` et `@prisma/client ^5 \|\| ^6 \|\| ^7` | Prisma 7.10.0 | bloquant |
| `vitest@4.1.11` : `vite ^6 \|\| ^7 \|\| ^8` | Vite 8.2.2 conservé | — |
| `vue-router@5.3.1` : `pinia ^3.0.4 \|\| ^4.0.2`, `vite ^7.3.0 \|\| ^8.0.0` | Pinia 4.0.3, Vite 8.2.2 | — |
| `@hono/zod-validator@0.9.1` : `hono >=4.11.2`, `zod ^3.25.0 \|\| ^4.0.0` | Hono 4.13.7, Zod 4.5.4 | — |
| `@hono/node-server@2.1.1` : `hono ^4` | Hono 4.x | — |

Le premier point mérite attention : le peer **optionnel** de Better Auth sur Vitest fait
échouer la résolution de npm dans un monorepo, alors qu'un peer optionnel passe
habituellement pour un simple avertissement. Vitest 4.1.11 accepte Vite 8, la rétrogradation
ne coûte donc rien d'autre.

### 5.1 Versions disponibles mais écartées

| Disponible | Retenu | Raison |
|---|---|---|
| `prisma` 8.0.0-rc.13 | 7.10.0 | Publiée sur le tag `latest` alors que c'est une version candidate. `npm i prisma` installerait une RC. Hors plage de Better Auth |
| TypeScript 7.0.2 | 6.0.3 | Réécriture native du compilateur. `vue-tsc` déclare `typescript >=5.0.0`, plage rédigée avant l'existence de TS 7 |
| Node 26.8.1 | 24.20.0 | Ligne *Current*, pas LTS |
| Vitest 5.0.0 | 4.1.11 | Voir section 5 |
| `vue` 3.6.0-beta.17 | 3.5.42 | Version bêta |
| `@types/node` 26.5.0 | 24.13.3 | Doit correspondre à la ligne du runtime |

## 6. Pièges rencontrés à l'installation

Chacun a fait échouer une commande réelle. Ils sont consignés pour éviter de les
rediagnostiquer.

### 6.1 Prisma 7 : l'URL sort du schéma

Prisma 7 refuse `url = env("DATABASE_URL")` dans le bloc `datasource` :

```
error: The datasource property `url` is no longer supported in schema files.
```

La connexion se déclare désormais dans `api/prisma.config.ts`, et le client s'instancie avec
un **adaptateur de pilote**. D'où la présence de `@prisma/adapter-pg` et de `pg` dans les
dépendances : contrairement aux versions précédentes, Prisma 7 n'embarque plus son propre
pilote.

### 6.2 TypeScript 6 : `baseUrl` est déprécié

```
error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0.
```

Les chemins se déclarent sans `baseUrl` : `"paths": { "@/*": ["./src/*"] }`.

### 6.3 npm 12 bloque les scripts d'installation

npm 12 n'exécute plus les scripts `preinstall` et `postinstall` sans autorisation explicite.
Sans elle, le moteur Prisma et le binaire esbuild ne sont pas téléchargés, et rien ne
fonctionne.

L'autorisation est versionnée dans `package.json` :

```json
"allowScripts": {
  "prisma@7.10.0": true,
  "@prisma/engines@7.10.0": true,
  "esbuild@0.28.2": true,
  "fsevents@2.3.3": true
}
```

Cette liste est nominative et porte la version : elle devra être mise à jour à chaque montée
de ces paquets. C'est voulu — un script d'installation est du code exécuté sur la machine du
développeur et sur celle de la CI.

## 7. Sécurité des dépendances

`npm audit` signale **4 avis de sévérité haute**. Aucun n'est corrigé, et c'est délibéré.

| Paquet | Avis | Chemin | Atteignable ? |
|---|---|---|---|
| `mysql2` 3.15.3 | dégradation du greffon d'authentification ; bombe de décompression zlib | peer optionnel de `better-auth` et de `prisma` | **Non.** Le projet utilise PostgreSQL ; aucun code n'importe `mysql2`, et les deux avis supposent une connexion à un serveur MySQL hostile |
| `deepmerge-ts` 7.1.5 | épuisement de pile sur graphes récursifs | `prisma` → `@prisma/config` | **Non.** Fusion de notre propre fichier de configuration, au moment de la migration |

`npm audit fix --force` **rétrograderait Prisma en 6.19.3**, une régression majeure, pour
corriger un pilote MySQL que nous n'employons pas. Le remède est pire que le mal.

Deux tentatives de correction propre ont échoué et sont consignées pour ne pas être
retentées : un `overrides` npm ne s'applique pas à un peer optionnel installé
automatiquement, et déclarer `mysql2` explicitement produit deux copies dans l'arbre au lieu
d'une.

**Décision** : conserver, documenter, et réévaluer à chaque montée de Better Auth ou de
Prisma.

## 8. Revérifier

```sh
# dernière version publiée d'un paquet
curl -s https://registry.npmjs.org/hono | \
  python3 -c "import sys,json;print(json.load(sys.stdin)['dist-tags'])"

# contraintes déclarées par une version précise
curl -s https://registry.npmjs.org/better-auth/1.7.3 | \
  python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('peerDependencies'),d.get('engines'))"

# lignes LTS de Node
curl -s https://nodejs.org/dist/index.json | \
  python3 -c "import sys,json;print([(r['version'],r['lts']) for r in json.load(sys.stdin)[:40] if r['lts']][:3])"
```

Vérification complète du dépôt :

```sh
npm ci && npm run db:generate && npx biome ci . && npm run typecheck && npm test && npm run build
```

## 9. Politique de mise à jour

- Une montée de version par commit, jamais groupée : une régression doit pouvoir être
  attribuée.
- Aucune montée vers une version `beta`, `rc` ou `next`. Vérifier que le tag `latest` n'en
  est pas une, comme c'est le cas de `prisma`.
- Toute montée de `prisma`, `@prisma/engines` ou `esbuild` impose de mettre à jour
  `allowScripts` dans `package.json`.
- Avant toute montée, relire les contraintes déclarées avec les commandes de la section 8,
  puis relancer la vérification complète.
