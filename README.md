# On Sort ?

Application web d'organisation de sorties de groupe.

« On Sort ? » réunit dans un seul outil ce qui est aujourd'hui éclaté entre un sondage
de dates, une recherche de lieu et une application de partage de dépenses. La boucle
d'usage complète est : disponibilités → date → activités → carte → partage des dépenses.

## Concepts

| Objet           | Description                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Utilisateur** | Compte personnel. Saisit ses périodes d'indisponibilité dans un calendrier privé.                                               |
| **Groupe**      | Ensemble de membres persistants, porteur d'un calendrier de groupe.                                                             |
| **Événement**   | Créé dans un groupe ou en ad hoc. Porte une date, des participants, des activités et des dépenses. Administré par son créateur. |
| **Activité**    | Resto, bar, musée, balade, run… Localisée par une adresse, horodatée, ordonnable, avec ses propres participants.                |
| **Dépense**     | Rattachée à une activité, à l'événement, ou à rien. Partage équitable, en pourcentage ou en montant fixe.                       |

## Principes retenus

- **Compte obligatoire.** Aucun accès anonyme : rejoindre un événement suppose de
  s'authentifier.
- **La date est fixée par le créateur** de l'événement, sous forme d'une date précise ou
  d'une période. Les invités acceptent ou déclinent.
- **Décision collective par vote** sur les activités. Les votes sont modifiables et le
  décompte s'actualise en direct ; l'administrateur clôt quand il le décide.
- **Calendrier à deux dimensions** : le calendrier personnel liste les indisponibilités,
  le calendrier partagé du groupe superpose celles de ses membres.
  Le groupe voit uniquement « occupé », jamais la raison.
- **Trois canaux d'invitation** : lien à copier, adresse e-mail, ou ami dans l'application.
  Une liste d'amis permet le troisième.
- **Présence renseignée par activité**, pour que le partage des dépenses reste juste.
- **Règlement hors application** via Wero. L'application calcule qui doit combien, minimise le
  nombre de virements et permet de marquer un règlement comme effectué.
- **Carte** : un pin par activité, ajoutée par adresse, les pins étant reliés selon l'ordre
  des activités.
- Montants en **euros** uniquement.

## Périmètre

### MVP

Comptes, amis, groupes, calendrier personnel et calendrier partagé du groupe, création
d'événement et invitations par trois canaux, proposition d'activités avec vote et décompte
en temps réel, carte avec pins par adresse, dépenses (partage équitable, en pourcentage ou
en montant fixe, rattachement par activité, présence, récapitulatif optimisé, validation de
règlement en deux temps), notifications internes.

Le séquencement retenu place des points de coupe explicites : à l'issue du jalon M3, le
produit est cohérent et se défend seul. Voir la section 9 de la conception.

### Reporté en V2

Itinéraire routé entre les activités, notifications push navigateur, relance automatique des
non-votants, suggestions intelligentes.

## Stack

| Couche             | Choix                                                       |
| ------------------ | ----------------------------------------------------------- |
| Organisation       | Monorepo `npm workspaces` — `api/` et `web/`                |
| Front              | Vue 3 + Vite + TypeScript (SPA)                             |
| Back               | Node 24 LTS + Hono                                          |
| Types front ↔ back | Hono RPC                                                    |
| Base de données    | PostgreSQL 17                                               |
| Accès aux données  | Prisma 7 + `@prisma/adapter-pg`                             |
| Authentification   | Better Auth (plugin `magicLink`), compte obligatoire        |
| Carte              | Leaflet + tuiles raster MapTiler ou Stadia (offre gratuite) |
| Géocodage          | API Base Adresse Nationale (`api-adresse.data.gouv.fr`)     |
| Email              | Resend                                                      |
| Temps réel         | SSE, deux flux : par événement et personnel                 |
| Qualité            | Biome (format et lint), Vitest, GitHub Actions              |
| Base locale        | Docker (PostgreSQL)                                         |

Les versions exactes et les contraintes qui les déterminent sont dans
[`docs/versions.md`](docs/versions.md).

Le déploiement n'est pas encore défini. Un VPS est disponible ; le choix de la chaîne de
livraison est reporté — mais il devient un livrable du jalon M1, dont la démonstration
suppose une URL publique.

Les raisons de chacun de ces choix, ainsi que les options écartées, sont documentées dans
[`docs/decisions-techniques.md`](docs/decisions-techniques.md). La conception détaillée —
modèle de données, règles métier, API, séquencement — est dans
[`docs/conception.md`](docs/conception.md).

## Structure prévue

```txt
onsort/
├─ api/                    # Node + Hono
│  ├─ prisma/
│  │  ├─ schema.prisma     # modèle de données
│  │  └─ migrations/
│  ├─ prisma.config.ts     # URL de connexion (Prisma 7)
│  └─ src/
│     ├─ main.ts           # expose AppType pour le client typé
│     ├─ modules/          # auth, friends, groups, events, activities, expenses
│     └─ lib/              # sse, money, permissions
├─ web/                    # Vue 3 + Vite
│  └─ src/
│     ├─ lib/api.ts        # client Hono RPC typé
│     └─ views/ components/ stores/
├─ docs/
├─ docker-compose.yml      # PostgreSQL local
└─ package.json            # workspaces
```

## Démarrage

### Prérequis

- **Node 24** — la version exacte est dans `.nvmrc`. Avec nvm : `nvm use`.
- **Docker**, pour la base de données.

### Installation

```sh
npm install
cp .env.example .env
```

Puis ouvrir `.env` et renseigner `BETTER_AUTH_SECRET`, qui doit faire au moins 32 caractères :

```sh
openssl rand -base64 32
```

Laisser `RESEND_API_KEY` **vide**. Sans clé, les liens magiques s'affichent dans la console du
serveur au lieu d'être envoyés par courriel : c'est ainsi qu'on se connecte en développement,
sans dépendre d'une boîte de réception.

### Vérifier les ports avant de lancer

Deux ports sont fréquemment déjà occupés sur une machine de développeur. Vérifie-les :

```sh
lsof -nP -iTCP:5433 -sTCP:LISTEN    # base de données
lsof -nP -iTCP:3000 -sTCP:LISTEN    # API
```

- **5433** — port hôte du conteneur PostgreSQL. Il n'est pas sur 5432, précisément parce que
  beaucoup de machines y ont déjà un PostgreSQL installé.
- **3000** — port de l'API. S'il est pris, change **`PORT` et `BETTER_AUTH_URL` ensemble** dans
  `.env`, par exemple sur 3100. Le mandataire du front lit `PORT` et suivra.
- **5173** — port du front, fixé par Vite.

### Lancer

```sh
npm run db:up        # PostgreSQL 17 en conteneur
npm run db:migrate   # applique les migrations
npm run db:seed      # crée alice@, bob@ et carla@example.test
npm run dev          # API et front en parallèle
```

L'application est alors sur **http://localhost:5173**.

### Se connecter

Il n'y a pas de mot de passe : l'authentification se fait uniquement par lien magique.

1. Ouvrir http://localhost:5173 — la redirection vers l'écran de connexion est automatique.
2. Saisir `alice@example.test` et valider. Le message de confirmation est volontairement
   identique que le compte existe ou non.
3. **Le lien magique s'affiche dans la console où tourne `npm run dev`.** Le copier.
4. L'ouvrir dans le navigateur. Il aboutit sur le port de l'API, où aucune page n'existe :
   c'est normal, le cookie de session vient d'être posé.
5. Revenir sur http://localhost:5173 — l'application affiche l'identité connectée.

### Vérification

```sh
npm run lint         # Biome, format et règles
npm run typecheck    # tsc et vue-tsc
npm test             # Vitest sur les deux espaces
npm run build
```

C'est exactement ce que la CI exécute à chaque poussée. Les trois premières commandes doivent
passer avant tout commit.

### En cas de problème

| Symptôme | Cause | Remède |
|---|---|---|
| `role "onsort" does not exist` | Un autre PostgreSQL occupe le port visé | Vérifier que `DATABASE_URL` pointe bien sur **5433** |
| `Connection url is empty` | Commande Prisma lancée depuis la racine | Passer par les scripts npm, qui s'exécutent depuis `api/` |
| `Cannot find native binding` | Verrou npm incomplet pour cette plateforme | `rm -rf node_modules package-lock.json && npm install` |
| Le front ne joint pas l'API | `PORT` changé sans `BETTER_AUTH_URL` | Changer les deux ensemble dans `.env` |
| Aucun lien magique visible | `RESEND_API_KEY` renseignée | La vider pour revenir au repli console |

## Documentation

Pour reprendre le projet, lire dans cet ordre :

1. [`CLAUDE.md`](CLAUDE.md) — contexte, conventions et **pièges connus**. À lire avant de
   toucher au code ; chargé automatiquement par les agents de développement.
2. [Comment on travaille](docs/workflow.md) — jalons, méthode de test, relecture, commits.
3. [Conception détaillée](docs/conception.md) — modèle de données, règles métier, API.
   **Fait autorité en cas de contradiction.**
4. [Décisions techniques et produit](docs/decisions-techniques.md) — chaque choix, les options
   écartées, la raison.
5. [Versions et compatibilité](docs/versions.md) — versions exactes et contraintes.
6. [Journal des décisions](docs/journal-decisions.md) — arbitrages pris en cours de route,
   avec leur coût en cas d'erreur.
7. [Plans d'implémentation](docs/plans/) — un par jalon.
8. [Rapport de projet](RAPPORT.md) — veille et revirements, pour le cours *Culture des concepts
   informatiques*.

## Équipe

Eliott Barker · Théo Gillet · Paul Ragueneau — Master 2, Efrei.
