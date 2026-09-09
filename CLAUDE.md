# Instructions pour un agent travaillant sur « On Sort ? »

Ce fichier est chargé automatiquement au démarrage par les agents de développement. Il décrit
ce qu'un agent doit
savoir avant de toucher au code, et surtout ce qui nous a déjà coûté du temps.

## Le projet

Application web d'organisation de sorties de groupe. Elle réunit en un seul outil le choix
d'une date, la construction d'un programme d'activités et le partage des dépenses. Projet de
cours de master, cours « Culture des concepts informatiques », Efrei.

Équipe : Eliott Barker, Théo Gillet, Paul Ragueneau.

## Où se trouve l'autorité

Quand deux documents se contredisent, l'ordre de préséance est le suivant :

| Rang | Document | Contenu |
|---|---|---|
| 1 | `docs/conception.md` | Modèle de données, règles métier, API. **Fait autorité sur tout le reste.** |
| 2 | `docs/decisions-techniques.md` | Chaque choix technique, les options écartées, la raison |
| 3 | `docs/versions.md` | Versions exactes et contraintes qui les déterminent |
| 4 | `docs/workflow.md` | Comment on travaille : méthode, conventions, jalons |
| 5 | `docs/journal-decisions.md` | Arbitrages pris en cours de route, avec leur motif |
| 6 | `docs/plans/` | Plans d'implémentation, un par jalon |

Si tu prends une décision qui contredit l'un de ces documents, **corrige le document dans le
même commit que le code**. Un document qui ment est pire que pas de document.

## État actuel

Les jalons **M0 à M6** sont terminés côté code : socle et authentification, événement et
invitations, activités et vote en temps réel, dépenses et règlements, groupes et calendrier
partagé, carte et géocodage, puis amis et notifications.

Un utilisateur crée un événement, invite, chacun répond, propose des activités et vote. Les
dépenses se saisissent, les soldes s'en dérivent, et l'application propose le plus petit jeu
de virements qui remet tout le monde à zéro. Un groupe superpose les indisponibilités de ses
membres et fait apparaître les créneaux qui conviennent à tous. Le programme s'affiche sur
une carte, pins numérotés dans l'ordre. Et chaque geste qui concerne quelqu'un le prévient,
en direct, sans qu'il recharge.

**M3 était le point de coupe** de `docs/conception.md` §9 : le produit se défend désormais
seul.

**Reste dû, hors code :** le déploiement sur une URL publique HTTPS, livrable de M1. La
chaîne de livraison et l'accès au VPS ne sont pas tranchés.

Le jalon suivant est **M7 — finitions : partage en pourcentage et en montant fixe,
réordonnancement des activités, annulation**. Le séquencement complet est en section 9 de
`docs/conception.md`.

## Stack

Monorepo `npm workspaces`, deux espaces : `api/` et `web/`.

| Couche | Choix |
|---|---|
| Runtime | Node 24 LTS — version exacte dans `.nvmrc` |
| API | Hono, servi par `@hono/node-server` |
| Base | PostgreSQL 17 en conteneur, accès par Prisma 7 + `@prisma/adapter-pg` |
| Authentification | Better Auth, greffon `magicLink` seul, **compte obligatoire** |
| Front | Vue 3 + Vite, SPA, Pinia, Vue Router, Tailwind |
| Types partagés | Hono RPC — `web` importe `AppType` et `SessionUser` depuis le paquet `api` |
| Carte | Leaflet, tuiles OpenStreetMap, géocodage Base Adresse Nationale — sans clé |
| Courriel | Resend, avec repli console quand aucune clé n'est configurée |
| Qualité | Biome, Vitest, GitHub Actions |

Versions exactes et raisons dans `docs/versions.md`.

## Commandes

```sh
npm run db:up          # PostgreSQL en conteneur
npm run db:migrate     # migrations Prisma
npm run db:seed        # comptes de développement
npm run dev            # API et front en parallèle

npm run lint           # Biome
npm run typecheck      # tsc et vue-tsc
npm test               # Vitest sur les deux espaces
npm run build
```

## Portes de vérification — obligatoires

Avant **chaque** commit, dans cet ordre :

```sh
npx biome check --write .
npm run typecheck
npm test
```

Ces trois commandes sont exactement ce que la CI exécute. Ne commite jamais sans les avoir
passées.

**Le typage est une porte à part entière.** Sur ce projet, il est resté cassé pendant cinq
tâches parce que seuls les tests étaient lancés — la CI aurait été rouge au premier passage.
Lancer `npm test` sans `npm run typecheck` ne prouve rien.

## Conventions

- **Langue.** Identifiants, noms de fichiers et messages de commit en **anglais**. Textes lus
  par un humain — messages d'erreur, journaux, interface, documentation — en **français**.
- **Commits.** Conventional Commits, en anglais. Le corps explique *pourquoi*, pas *quoi* : le
  diff dit déjà quoi. **Aucune ligne d'attribution** — pas de `Co-Authored-By`, aucune mention
  d'un agent ou de son éditeur, pas d'emoji, pas de lien de session. Le message se termine sur
  sa dernière ligne de contenu.
- **Versions épinglées à l'exact**, sans `^` ni `~`. Aucune montée de version sans raison
  consignée.
- **Aucun secret dans le dépôt.** Toute variable nouvelle va dans `.env.example` avec une
  valeur d'exemple inoffensive. `.env` n'est jamais versionné.
- **TDD.** Écrire le test, le voir échouer, écrire le minimum, le voir passer, commiter.
- **Argent en centimes entiers.** Aucun flottant dans le domaine financier, jamais. Les
  coordonnées géographiques sont la seule exception : une mesure, pas une somme.
- **Intervalles semi-ouverts** pour tout ce qui touche au temps : début inclus, fin exclue.
  Le test de chevauchement s'écrit `startsAt < :fin AND endsAt > :début`. Un `<=` glissé
  quelque part fabrique des conflits qui n'existent pas.

## Pièges connus — lis cette section avant de perdre du temps

Chacun a réellement coûté une demi-journée à quelqu'un.

**Le port 5432 est souvent déjà pris.** Beaucoup de machines ont un PostgreSQL installé. Le
conteneur est donc publié sur **5433**. Symptôme si tu te trompes : `role "onsort" does not
exist` — tu parles à l'autre PostgreSQL, pas au nôtre. La CI, elle, reste sur 5432 : aucun
conflit n'y existe.

**Le port 3000 peut être pris aussi.** `PORT` dans `.env` est surchargeable, et le mandataire
de Vite le lit. Change les deux ensemble : `PORT` **et** `BETTER_AUTH_URL`.

**Prisma 7 ne charge plus les fichiers `.env`.** L'URL de connexion ne vit pas dans
`schema.prisma` — Prisma 7 la refuse — mais dans `api/prisma.config.ts`, qui charge `.env`
lui-même. Le client s'instancie avec un adaptateur de pilote.

**Le chemin `../.env` de `api/prisma.config.ts` est relatif au répertoire courant.** Une
commande Prisma lancée depuis la racine échoue sur « Connection url is empty ». Passe par les
scripts npm, qui s'exécutent depuis `api/`. Correction propre en attente.

**Biome n'analyse pas les gabarits Vue.** Toute liaison — variable **ou import** — utilisée
uniquement dans un `<template>` lui paraît morte. Les règles `noUnusedVariables` **et**
`noUnusedImports` sont donc désactivées pour les seuls fichiers `.vue`, via `overrides`.
**N'applique jamais sa correction automatique sur un `.vue`** : elle supprimerait du code
utilisé.

**`npm run <script> --workspaces` s'exécute en séquence.** Un script qui ne rend jamais la
main empêche les suivants de démarrer. C'est pourquoi le script `dev` lance les deux serveurs
en parallèle à la main.

**Le fichier de verrouillage npm n'enregistre que la plateforme qui l'a généré**, s'il grandit
par ajouts successifs. Symptôme : `Cannot find native binding` en CI sous Linux. Correction :
supprimer `node_modules` **et** `package-lock.json`, puis réinstaller. Attention,
`npm install --package-lock-only` ne suffit pas, il ne re-résout pas les dépendances
optionnelles de plateforme.

**Ne monte jamais un dépôt dans un conteneur Linux sans exclure `node_modules`.** Un `npm ci`
à l'intérieur remplacerait l'installation locale par sa version Linux. Travaille sur une copie.

**Better Auth résout un `callbackURL` relatif contre sa propre `baseURL`, pas contre le
front.** En développement les deux origines diffèrent : un chemin relatif renvoie donc sur
l'API, où aucune page n'existe. Le front envoie une URL absolue bâtie sur
`window.location.origin` ; `trustedOrigins` la valide côté API et refuse le reste par un 403.

**Un test qui ouvre un flux SSE sans l'abandonner suspend Vitest indéfiniment.** Le flux ne
se ferme jamais de lui-même et son battement de cœur maintient une minuterie ouverte. Passer
un `AbortController` à `app.request`, l'abandonner, puis annuler le corps de la réponse —
voir `api/tests/modules/stream.test.ts`.

**`npm test` vide la base à chaque test.** Les comptes de `npm run db:seed` disparaissent
donc dès qu'on lance la suite. Relancer le seed avant une démonstration.

**`api/tests/helpers/db.ts` liste les tables à vider à la main.** Chaque jalon qui ajoute
des tables doit étendre `TABLES`. `TRUNCATE ... CASCADE` rend l'ordre indifférent, mais une
table oubliée laisse des lignes entre les tests et les rend dépendants de leur ordre.

**Prisma refuse `migrate reset` et `migrate dev` lancés par un agent.** Pour retravailler
une migration en développement : éditer le `.sql`, puis
`docker exec onsort-db psql -U onsort -d onsort -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'`
et `npm run db:migrate --workspace api` (qui appelle `migrate dev`) — ou demander à un
humain de lancer `reset`. `migrate deploy` n'est pas bloqué.

**PostgreSQL et JavaScript ne comparent pas les chaînes de la même façon.** La base est en
`en_US.utf8`, dont l'ordre est linguistique : `'Z' < 'a'` y vaut **faux**, quand le même test
en JavaScript vaut **vrai**. Une contrainte `CHECK` qui ordonne deux identifiants doit donc
porter `COLLATE "C"`, sinon elle rejette une fois sur deux ce que la couche applicative vient
de normaliser — et l'échec est **intermittent**, puisqu'il dépend de la casse d'identifiants
tirés au hasard. Vu au jalon M6 sur `friendships_ordered_pair`.

**Une contrainte `CHECK` ajoutée à une migration doit l'être avant sa première
application.** Éditer un `.sql` déjà appliqué casse sa somme de contrôle. Reconstruire le
schéma (ci-dessus) puis réappliquer.

**Après un `git pull` qui touche `schema.prisma`, régénère le client avant les portes.**
`api/src/generated/` n'est pas versionné : le typage échoue alors sur des `TS2339` du genre
« Property 'event' does not exist on type 'PrismaClient' », qui accusent le code alors que
c'est l'artefact local qui est périmé. `npm run db:generate --workspace api`. `db:migrate` ne
suffit pas si la migration est déjà appliquée en base — `migrate dev` n'a alors rien à faire.

**Ne lance jamais une porte à travers un tube.** `npm run typecheck | tail -1` rend le code
de sortie de `tail`, toujours nul : l'échec disparaît et la chaîne `&&` continue. Le typage
est resté cassé trois commits d'affilée pour cette raison au jalon M3. Lance chaque porte
seule, ou redirige vers un fichier et teste le code de retour.

## Règles métier à ne pas affaiblir

- **Anti-énumération de comptes.** Saisir une adresse renvoie toujours la même réponse — même
  message, même code HTTP — que le compte existe ou non. Ne « rends jamais service » à
  l'utilisateur en lui disant que son adresse est inconnue : ça transforme l'application en
  oracle. Correspondance stricte sur l'adresse, jamais de recherche partielle.
- **Aucun solde n'est stocké.** Un solde est toujours dérivé des parts de dépenses et des
  règlements. Un règlement est une ligne indépendante.
- **Les parts d'une dépense sont figées à la saisie.** Rejoindre un événement tardivement n'a
  aucun effet rétroactif.
- **Forme d'erreur uniforme** dans toute l'API : `{ code, message, details }`, `details`
  toujours présent, objet vide quand il n'y a rien à dire. Un gestionnaire global couvre les
  erreurs inattendues et n'expose jamais de détail interne au client.
- **Aucun état de la machine à états d'un événement n'est absorbant.** Un événement ne doit
  jamais pouvoir se retrouver bloqué.

## Ce qu'il ne faut pas faire

- Ne commite pas `.env`, `api/src/generated/`, `api/dist/`, `web/dist/`.
- N'ajoute pas de dépendance sans nécessité démontrée, et jamais une version `beta`, `rc` ou
  `next`. Vérifie que le tag `latest` n'en est pas une : c'est le cas de `prisma`.
- Ne lance pas `npm audit fix --force` : il rétrograderait Prisma. Les avis ouverts concernent
  un pilote MySQL que le projet n'utilise pas — voir `docs/versions.md` section 7.
- Ne désactive pas une règle de lint pour faire taire un avertissement. Corrige, ou explique.
- N'ouvre pas de pull request sans qu'on te l'ait demandé.
