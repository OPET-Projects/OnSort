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

### Où en est le projet

**Les jalons M0 à M6 sont livrés** : comptes et connexion par lien magique, événements et
invitations, activités avec vote et décompte en temps réel, dépenses et règlements, groupes
et calendrier partagé, carte et géocodage, amis et notifications.

**Reste M7** — partage en pourcentage et en montant fixe, réordonnancement des activités,
annulation. Le paragraphe ci-dessus décrit le MVP **visé** : ces trois finitions n'existent
pas encore.

Reste également dû, hors code : le déploiement sur une URL publique, livrable du jalon M1.

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
4. L'ouvrir dans le navigateur. Il pose le cookie de session puis renvoie sur le front, à
   l'endroit d'où la connexion est partie — le tableau de bord ici, l'invitation si on
   arrive par un lien d'invitation.

Un compte créé de cette façon n'a jamais saisi de nom : l'application en dérive un depuis
l'adresse (`jean.dupont@…` devient « Jean Dupont »).

### Créer et partager un événement

1. Depuis le tableau de bord, **Nouvel événement** : un titre, une date de début, une date
   de fin.
2. Sur la page de l'événement, section **Inviter** : **Créer un lien partageable**, puis
   **Copier**. Le lien a la forme `http://localhost:5173/invite/<jeton>`.
3. Dans une fenêtre privée, ouvrir ce lien. L'application demande de se connecter, puis
   revient sur l'invitation et fait rejoindre l'événement.
4. L'invité répond **Je participe** / **Je ne peux pas** ; le créateur voit la réponse en
   rafraîchissant la page.

L'invitation par adresse e-mail suit le même chemin : le courriel (affiché en console sans
clé Resend) contient un lien `…/invite/<id>`. La réponse est volontairement identique que
l'adresse ait un compte ou non.

### Voir le décompte bouger en direct

C'est la démonstration du jalon M2, et elle demande **deux écrans**.

1. Les deux comptes doivent avoir **accepté** l'événement : proposer et voter y sont
   réservés. Un invité qui n'a pas répondu peut consulter le programme, mais les boutons de
   vote lui restent fermés et l'interface lui dit pourquoi.
2. Ouvrir le même événement dans deux navigateurs, onglet **Programme**.
3. Sur l'un, proposer une activité. Elle apparaît des deux côtés.
4. Voter **Pour** d'un côté : le compteur de l'autre écran bouge **sans rechargement**.
   Changer d'avis remplace la voix au lieu de l'ajouter.
5. L'administrateur peut **Retenir** ou **Écarter**, y compris contre la majorité — le vote
   informe la décision, il ne la contraint pas. **Rouvrir le vote** ramène l'activité en
   discussion : aucun état n'est bloquant.

### Quatre virements au lieu de dix

C'est la démonstration du jalon M3, et elle demande **deux écrans** comme la précédente.

1. Réunir trois ou quatre participants ayant **accepté** l'événement — saisir une dépense y
   est réservé, comme le vote.
2. Onglet **Dépenses**. Chacun saisit ce qu'il a avancé : « Restaurant, 90 », « Taxi, 30 ».
   Le montant se tape en euros, la virgule décimale est acceptée ; l'API, elle, ne manipule
   que des centimes entiers.
3. La dépense apparaît sur l'écran d'en face **sans rechargement**, et chaque carte indique
   ce qu'elle coûte à celui qui la lit.
4. Plus bas, les **soldes** : qui a avancé, qui doit. Leur somme est toujours nulle. Puis
   les **virements à faire** — au plus N−1 pour N participants, là où un remboursement deux
   à deux en produirait bien davantage.
5. Le débiteur clique **J'ai envoyé**. Son solde ne bouge pas encore : un virement déclaré
   n'est pas un virement reçu. La ligne passe en **attente de confirmation** sur les deux
   écrans.
6. Le créancier clique **J'ai reçu**. Les deux soldes tombent à zéro, en direct, des deux
   côtés.

Une déclaration faite par erreur se **retire** tant qu'elle n'est pas confirmée. Après
confirmation elle est définitive : un règlement est un fait, et se corrige par un virement
inverse.

Modifier une dépense recalcule ses parts ; changer la présence à une activité, jamais. Une
dépense passée ne se réécrit pas.

### Le créneau qui convient à tous

C'est la démonstration du jalon M4, et le différenciateur du sujet — `conception.md` §9 le
fait passer devant la carte.

1. Depuis le tableau de bord, **Mes groupes** → créer un groupe, puis **Inviter** deux
   personnes par leur adresse. Chacune reçoit un lien et rejoint le groupe.
2. Chacun déclare ses absences depuis **Mes indisponibilités**. Le motif est facultatif et
   **privé** : le groupe verra « occupé », jamais la raison.
3. Deux saisies qui se touchent — « du 1 au 2 » puis « du 2 au 3 » — deviennent **une seule
   ligne**. C'est voulu : c'est ainsi que l'invariant de non-superposition est tenu.
4. La page du groupe affiche les **créneaux où personne n'est occupé**, avec leur durée, et
   en dessous qui bloque quoi.
5. Les sélecteurs changent la fenêtre — 7, 30 ou 90 jours — et la durée minimale d'un
   créneau. Un trou d'une heure entre deux absences n'est pas une sortie.

Le motif d'une indisponibilité ne franchit jamais la route du calendrier partagé : un test
échoue si un libellé apparaît dans la réponse.

### Le programme sur une carte

C'est la démonstration du jalon M5.

1. Onglet **Programme**, proposer une activité et renseigner le champ « où ? ». Des adresses
   sont proposées **à la frappe** : les retenir plutôt que de taper librement donne au
   géocodage un libellé qu'il sait replacer.
2. Onglet **Carte** : les activités dont l'adresse a été reconnue portent un pin **numéroté
   dans l'ordre du programme**, et la carte se cadre sur l'ensemble des points.
3. Une activité sans adresse, ou dont l'adresse n'a pas été reconnue, n'apparaît pas — elle
   reste parfaitement valide, elle n'a simplement pas de lieu à montrer.

**La Base Adresse Nationale géocode des adresses, pas des lieux.** « tour eiffel » seul ne
marque que 0,38 de confiance et ne produit aucun pin : c'est l'autocomplétion qui rend le
service utilisable, en proposant « Avenue Gustave Eiffel 75007 Paris ». La recherche de point
d'intérêt par son nom est explicitement écartée du MVP — voir `decisions-techniques.md` §2.7.

Ni clé ni compte : les tuiles viennent d'OpenStreetMap et le géocodage de la Base Adresse
Nationale, tous deux gratuits. L'attribution affichée en bas de carte est une **condition**
de la politique d'usage des tuiles, pas un ornement.

### La cloche qui bouge toute seule

C'est la démonstration du jalon M6, et elle demande **deux écrans**.

1. **Mes amis** → ajouter quelqu'un par son adresse. Sa cloche affiche une notification
   **sans qu'il recharge**. Il accepte, la vôtre bouge à son tour.
2. Dans un événement partagé, proposez une activité : les participants **ayant accepté**
   reçoivent « attend votre vote ». Ceux qui n'ont pas répondu ne reçoivent rien — ils ne
   peuvent pas voter.
3. Saisissez une dépense, déclarez un virement, faites-le confirmer : chaque geste prévient
   la personne concernée, et elle seule.

**Une action ne notifie jamais son auteur.** C'est la règle que chaque test vérifie, et elle
se voit tout de suite à l'usage : votre propre cloche ne bouge pas quand vous agissez.

La réponse à une demande d'ami est identique que l'adresse ait un compte ou non — c'est la
même règle anti-énumération que pour les invitations : l'application n'est jamais un oracle
qui dit qui est inscrit.

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
| `alice@example.test` inconnue après un `npm test` | La suite de tests vide la base avant chaque test | Relancer `npm run db:seed` |
| Le lien magique atterrit sur le port 3000 | Une cible de retour relative, résolue contre l'API | Passer par l'interface : elle envoie une cible absolue |

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
