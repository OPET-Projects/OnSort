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

- **Décision collective par vote** sur les dates et sur les activités.
- **Calendrier à deux dimensions** : le calendrier personnel liste les indisponibilités,
  le calendrier de groupe superpose celles des membres et suggère un créneau commun.
  Le groupe voit uniquement « occupé », jamais la raison.
- **Présence renseignée par activité**, pour que le partage des dépenses reste juste.
- **Règlement hors application** via Wero. L'application calcule qui doit combien, minimise le
  nombre de virements et permet de marquer un règlement comme effectué.
- **Carte** : un pin par activité, ajoutée par adresse, les pins étant reliés selon l'ordre
  des activités.
- Montants en **euros** uniquement.

## Périmètre

### MVP

Comptes, groupes, calendriers personnel et de groupe (suggestion de créneau et avertissement
en cas de sélection manuelle), création d'événement et invitations, proposition d'activités
avec vote, carte avec pins par adresse, dépenses (partage équitable, rattachement par
activité, présence, récapitulatif optimisé, validation de règlement), notifications in-app.

### Reporté en V2

Itinéraire routé entre les activités, partage en pourcentage et en montant fixe,
notifications push navigateur, suggestions intelligentes.

## Stack envisagée

| Couche             | Choix                                                       |
| ------------------ | ----------------------------------------------------------- |
| Front              | Vue 3 + Vite + TypeScript (SPA)                             |
| Back               | Deno 2 + Hono                                               |
| Types front ↔ back | Hono RPC                                                    |
| Base de données    | PostgreSQL 17                                               |
| Accès aux données  | Drizzle ORM + `postgres.js`                                 |
| Authentification   | Better Auth (plugins `magicLink` et `anonymous`)            |
| Carte              | Leaflet + tuiles raster MapTiler ou Stadia (offre gratuite) |
| Géocodage          | API Base Adresse Nationale (`api-adresse.data.gouv.fr`)     |
| Email              | Resend                                                      |
| Base locale        | Docker (PostgreSQL)                                         |

Le déploiement n'est pas encore défini. Un VPS est disponible ; le choix de la chaîne de
livraison est reporté.

Les raisons de chacun de ces choix, ainsi que les options écartées, sont documentées dans
[`docs/decisions-techniques.md`](docs/decisions-techniques.md).

## Structure prévue

```txt
onsort/
├─ api/                 # Deno + Hono
│  ├─ src/
│  │  ├─ main.ts        # expose AppType pour le client typé
│  │  ├─ auth.ts        # Better Auth
│  │  ├─ db/            # schéma Drizzle + migrations
│  │  └─ routes/        # events, availability, activities, expenses
│  └─ tests/
├─ web/                 # Vue 3 + Vite
│  └─ src/
│     ├─ lib/api.ts     # client Hono RPC typé
│     ├─ views/ components/ stores/
├─ docs/
└─ docker-compose.yml   # PostgreSQL local
```

## Démarrage

Le projet n'est pas encore initialisé. Cette section sera complétée avec la mise en place
de `api/`, `web/` et du `docker-compose.yml` de développement.

## Documentation

- [Décisions techniques et produit](docs/decisions-techniques.md)
