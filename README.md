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

Prérequis : Node 24 (voir `.nvmrc`) et Docker.

```sh
npm install                  # installe les deux espaces de travail
cp .env.example .env         # puis compléter BETTER_AUTH_SECRET
npm run db:up                # PostgreSQL 17 en conteneur
npm run db:migrate           # migrations Prisma
npm run dev                  # API sur :3000, front sur :5173
```

Générer un secret d'authentification : `openssl rand -base64 32`.

Laisser `RESEND_API_KEY` vide en développement : les liens magiques sont alors écrits dans
la console plutôt qu'envoyés par courriel.

### Vérification

```sh
npm run lint                 # Biome
npm run typecheck            # tsc et vue-tsc
npm test                     # Vitest sur les deux espaces
npm run build
```

C'est exactement ce que la CI exécute à chaque poussée.

## Documentation

- [Rapport de projet](RAPPORT.md) — veille, démarche, revirements (cours *Culture des
  concepts informatiques*)
- [Conception détaillée](docs/conception.md)
- [Décisions techniques et produit](docs/decisions-techniques.md)
- [Versions et compatibilité](docs/versions.md)

## Équipe

Eliott Barker · Théo Gillet · Paul Ragueneau — Master 2, Efrei.
