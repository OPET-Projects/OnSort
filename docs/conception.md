# « On Sort ? » — spécification de conception

Date : 8 septembre 2026.
Statut : validée, prête pour le plan d'implémentation.

Ce document décrit ce qui doit être construit. Les raisons des choix de technologies et les
options écartées sont dans [`decisions-techniques.md`](decisions-techniques.md).

---

## 1. Objet et périmètre

Application web d'organisation de sorties de groupe, réunissant en un seul outil le choix
d'une date, la construction d'un programme d'activités et le partage des dépenses.

Le périmètre est complet : comptes, amis, groupes avec calendrier partagé, événements,
invitations par trois canaux, activités avec vote, carte, dépenses, notifications internes.
Le séquencement de la section 9 place des points de coupe explicites afin qu'une version
démontrable existe à chaque étape.

Stack arrêtée : Vue 3 + Vite en SPA, Node 24 LTS + Hono, PostgreSQL 17 + Prisma 7, Better Auth,
Leaflet, API Base Adresse Nationale, Resend, Docker pour la base locale.

---

## 2. Modèle de domaine

### 2.1 Authentification

Tables gérées par Better Auth : `user`, `session`, `account`, `verification`. Seul le plugin
`magicLink` est activé. **Le compte est obligatoire** : aucun accès anonyme, aucun compte
temporaire.

### 2.2 Social

```sql
friend_requests(
  id, from_user_id, to_user_id,
  status pending|accepted|declined,
  created_at,
  UNIQUE(from_user_id, to_user_id)
)

friendships(
  user_a_id, user_b_id, created_at,
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
)
```

La contrainte `user_a_id < user_b_id` normalise le couple : une amitié occupe une seule
ligne, et le test « sommes-nous amis » est une lecture directe sans disjonction.

### 2.3 Groupes

```sql
groups(id, name, created_by, created_at)

group_members(
  group_id, user_id,
  role admin|member,
  joined_at,
  PRIMARY KEY (group_id, user_id)
)
```

### 2.4 Calendrier personnel

```sql
unavailability(
  id, user_id,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  label text NULL,
  created_at,
  INDEX (user_id, starts_at)
)
```

`label` est privé. Il n'est jamais exposé dans une réponse de groupe : le groupe voit
« occupé », jamais la raison.

**Non-superposition.** Deux indisponibilités d'un même utilisateur ne doivent pas se
recouvrir. Une contrainte `EXCLUDE USING gist` sur un `tstzrange` l'aurait garanti au niveau
de la base, mais aucun ORM TypeScript ne l'exprime — voir `decisions-techniques.md` §2.3.

La règle est donc appliquée en couche service : à l'écriture, dans une transaction avec
verrou de ligne sur les indisponibilités de l'utilisateur, les plages qui se touchent ou se
recouvrent sont **fusionnées** plutôt que rejetées. C'est aussi la meilleure ergonomie.

**Convention de bornes** : intervalles semi-ouverts, `starts_at` inclus, `ends_at` exclu.
Deux créneaux adjacents ne se chevauchent donc pas. Le test de chevauchement s'écrit
`starts_at < :end AND ends_at > :start`.

Le calendrier partagé d'un groupe est la superposition des `unavailability` de ses membres
sur une fenêtre donnée. C'est une vue calculée, pas une table.

### 2.5 Événements

```sql
events(
  id, group_id NULL,
  title, description,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  status draft|active|closed,
  created_by, created_at
)

event_participants(
  id, event_id, user_id,
  role admin|member,
  rsvp invited|accepted|declined,
  joined_at,
  UNIQUE(event_id, user_id)
)
```

`group_id` nul désigne un événement ad hoc. `period` couvre aussi bien une date précise
(période courte) qu'un séjour de plusieurs jours.

La date est **fixée par le créateur**. Il n'existe pas de vote sur les dates : les invités
acceptent ou déclinent.

### 2.6 Invitations

```sql
invite_links(
  id, scope group|event, target_id,
  token_hash, expires_at, revoked_at, created_by, created_at
)

invitations(
  id, scope group|event, target_id,
  invited_user_id NULL,
  invited_email   NULL,
  status pending|accepted|declined,
  invited_by, created_at,
  CHECK (invited_user_id IS NOT NULL OR invited_email IS NOT NULL)
)
```

`invite_links` porte le lien réutilisable, à copier et coller. `invitations` porte une
invitation nominative, adressée soit à un utilisateur connu, soit à une adresse e-mail.

Les trois canaux — lien, e-mail, invitation d'un ami dans l'application — aboutissent tous à
la même chose : une ligne `event_participants` ou `group_members`.

### 2.7 Activités

```sql
activities(
  id, event_id,
  title, kind,
  address, lat, lng,
  starts_at timestamptz NULL,
  ends_at   timestamptz NULL,
  position int,
  status proposed|accepted|rejected,
  attendance_mode all|optional,
  proposed_by, created_at, cancelled_at NULL
)

activity_votes(
  activity_id, participant_id,
  value for|against,
  updated_at,
  PRIMARY KEY (activity_id, participant_id)
)

activity_absences(
  activity_id, participant_id,
  PRIMARY KEY (activity_id, participant_id)
)
```

`activity_absences` ne stocke que les exceptions, et n'a de sens que lorsque
`attendance_mode` vaut `optional`.

### 2.8 Dépenses

```sql
expenses(
  id, event_id, activity_id NULL,
  label,
  amount_cents int NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  paid_by participant_id,
  split_mode equal|percent|fixed,
  created_by, created_at, updated_at
)

expense_shares(
  id, expense_id, participant_id,
  amount_cents int NOT NULL
)

settlements(
  id, event_id,
  from_participant_id, to_participant_id,
  amount_cents int NOT NULL,
  declared_at, confirmed_at NULL
)
```

Trois propriétés à respecter absolument :

1. **Aucun solde n'est stocké.** Un solde est toujours dérivé de `expense_shares` et
   `settlements`. Un règlement est une ligne indépendante : un virement de 20 € reste un
   virement de 20 € même si une dépense antérieure est modifiée, et le delta réapparaît
   naturellement dans le solde.
2. **Les parts sont figées à la saisie.** `expense_shares` enregistre des montants absolus.
   Une modification ultérieure de la présence ou de la liste des participants ne touche
   jamais une dépense existante.
3. **`split_mode` ne concerne que le calcul en amont.** Le stockage est identique dans les
   trois modes. Le partage en pourcentage et en montant fixe ne coûtent donc que de
   l'interface.

Tous les montants sont des entiers de centimes. Aucun flottant n'apparaît dans le domaine
financier.

### 2.9 Notifications

```sql
notifications(
  id, user_id, event_id NULL,
  type, payload jsonb,
  read_at NULL, created_at
)
```

Types émis :

```txt
friend.request       friend.accepted
group.invited        event.invited
activity.proposed    activity.decided     activity.cancelled
expense.created      settlement.declared  settlement.confirmed
```

`activity.proposed` est émise à la création d'une activité vers tous les participants ayant
accepté, sauf le proposant. C'est la notification « tu dois voter ».

---

## 3. Règles métier

### 3.1 Cycle de vie d'un événement

```txt
draft ──► active ──► closed
  ▲         ▲          │
  └─────────┴──────────┘
```

`draft` : préparation, invitations non diffusées. `active` : tout est ouvert. `closed` :
saisie des dépenses gelée, soldes consultables en lecture seule.

L'administrateur peut revenir à un état antérieur. **Aucun état n'est absorbant** : c'est la
garantie qu'un événement ne peut pas se retrouver bloqué.

### 3.2 Participation

Rejoindre un événement passe toujours par une authentification, puis par la consommation
d'un lien ou d'une invitation. Un participant qui décline conserve sa ligne : il peut
changer d'avis, et l'administrateur voit qui a répondu quoi.

**Rejoindre tardivement n'a aucun effet rétroactif.** Les dépenses déjà saisies conservent
leurs parts.

### 3.3 Vote sur les activités

Une activité passe de `proposed` à `accepted` ou `rejected`. **Cette transition est
déclenchée uniquement par un administrateur**, sans échéance ni quorum.

Tant que l'activité est `proposed`, chaque participant peut poser ou modifier son vote
(`for` ou `against`). Ne pas voter est une abstention. Le décompte est diffusé en temps réel.

L'administrateur voit le décompte mais n'y est pas lié : il peut retenir une activité
minoritaire. Le vote informe la décision, il ne la contraint pas.

### 3.4 Présence

`attendance_mode = 'all'` : les présents sont les participants ayant accepté l'événement.
`attendance_mode = 'optional'` : les mêmes, moins ceux inscrits dans `activity_absences`.
Le mode par défaut est `all` ; l'administrateur peut le changer à tout moment.

Cette liste **pré-remplit** le formulaire de dépense sans le piloter. À l'enregistrement,
`expense_shares` fige les montants.

### 3.5 Arithmétique

Division en centimes entiers. Le reste est réparti de façon déterministe : les `reste`
premiers participants, triés par identifiant, reçoivent un centime supplémentaire.

Invariant vérifié par les tests :
`SUM(expense_shares.amount_cents) = expenses.amount_cents`.

**Solde d'un participant** = montants avancés − parts dues + transferts reçus − transferts
émis.

**Minimisation des virements** : algorithme glouton appariant le plus gros créancier au plus
gros débiteur, produisant au plus N−1 virements. Le problème est théoriquement NP-difficile,
mais l'heuristique est optimale en pratique pour N ≤ 20. Implémentée comme fonction pure
dans `lib/money.ts`.

### 3.6 Règlement

Deux états successifs : le débiteur déclare « envoyé » (`declared_at`), le créancier
confirme « reçu » (`confirmed_at`). Un seul état produirait des litiges, celui qui doit ne
pouvant pas décider seul qu'il a payé.

### 3.7 Activité annulée

`cancelled_at` est renseigné, sans suppression physique. Les dépenses associées survivent —
un acompte non remboursable existe — et sont rattachées à l'événement.

### 3.8 Permissions

| Action                                       | Autorisé à                    |
| -------------------------------------------- | ----------------------------- |
| Trancher le vote d'une activité              | administrateur de l'événement |
| Changer `attendance_mode`, clore l'événement | administrateur                |
| Proposer une activité, voter                 | participant ayant accepté     |
| Saisir une dépense                           | participant ayant accepté     |
| Déclarer un règlement envoyé                 | le débiteur                   |
| Confirmer un règlement reçu                  | le créancier                  |

Plusieurs administrateurs sont possibles dès la création. Si le dernier administrateur quitte
l'événement, le rôle passe automatiquement au participant le plus ancien.

---

## 4. Authentification et vie privée

Connexion par lien magique uniquement. Le token d'invitation doit survivre à l'aller-retour
de l'e-mail : il est déposé en cookie avant l'envoi et relu au retour.

L'e-mail se trouve donc sur le chemin critique — sans lui, personne ne peut se connecter.
Un mode de développement avec comptes pré-remplis et connexion directe est prévu, afin
qu'une démonstration ne dépende jamais de la délivrabilité.

**Règle anti-énumération.** La saisie d'une adresse e-mail, qu'il s'agisse d'inviter ou de
se connecter, renvoie toujours la même réponse : même message, même code HTTP, quel que soit
l'état du compte visé. Un compte existant reçoit une notification interne ou un e-mail ; une
adresse inconnue reçoit un e-mail d'invitation ; l'appelant ne peut pas distinguer les deux.

Correspondance stricte sur l'adresse, jamais de recherche partielle.

La limitation de débit sur ces points d'entrée est **hors périmètre de ce jalon** : voir
`decisions-techniques.md` section 6, qui la classe parmi les recommandations retirées du
cadre du cours. Elle redeviendra nécessaire dès que l'application sera exposée
publiquement.

---

## 5. API

Organisation en modules par fonctionnalité :

```txt
api/src/
  modules/
    auth/  friends/  groups/  availability/
    events/  activities/  expenses/  notifications/
  lib/
    sse.ts         bus de diffusion
    money.ts       centimes, répartition, minimisation
    permissions.ts
```

Chaque module porte ses routes, son service et ses tests. Le schéma reste centralisé dans
`api/prisma/schema.prisma` : les migrations et les clés étrangères ont besoin d'une vue
d'ensemble, et Prisma n'admet de toute façon qu'un schéma par projet.

L'URL de connexion vit dans `api/prisma.config.ts`, et le client s'instancie avec
`@prisma/adapter-pg` — exigences de Prisma 7.

### 5.1 Surface HTTP

```tx
/api/auth/*                        Better Auth

GET    /friends                    POST   /friends/requests
POST   /friends/requests/:id/accept
POST   /friends/requests/:id/decline

GET    /groups                     POST   /groups
GET    /groups/:id                 POST   /groups/:id/members
GET    /groups/:id/calendar        superposition, fenêtre from/to

GET    /me/unavailability          POST   /me/unavailability
DELETE /me/unavailability/:id

GET    /events                     événements de l'appelant, triés par date
POST   /events                     GET    /events/:id
PATCH  /events/:id
POST   /events/:id/invitations     lien ou adresse e-mail
GET    /invitations/:token         aperçu avant de rejoindre
POST   /invitations/:token/accept
POST   /events/:id/rsvp
GET    /events/:id/stream          SSE

GET    /events/:id/activities     programme, trié par position
POST   /events/:id/activities      PATCH  /activities/:id
POST   /activities/:id/vote
POST   /activities/:id/decision    administrateur
GET    /activities/:id/attendance  présents à une activité
POST   /activities/:id/attendance
POST   /activities/:id/cancel
PATCH  /events/:id/activities/order

GET    /events/:id/expenses        dépenses de l'événement
POST   /events/:id/expenses        PATCH  /expenses/:id
GET    /events/:id/balances        soldes et virements minimisés
POST   /events/:id/settlements     POST   /settlements/:id/confirm
DELETE /settlements/:id            retrait d'une déclaration non confirmée

GET    /notifications              POST   /notifications/:id/read
GET    /me/stream                  SSE
```

Validation par `zod` à la frontière via `@hono/zod-validator`, un schéma par route. Les
schémas sont importés tels quels par les formulaires du front : une seule définition, deux
usages.

### 5.2 Temps réel

Deux flux SSE : `/events/:id/stream` pour un événement ouvert à l'écran, `/me/stream` pour
les notifications personnelles.

`EventSource` ne permet pas d'envoyer d'en-têtes. L'authentification passe donc par **cookie
de session**, ce qui impose que le front et l'API soient servis sur la même origine.

Le bus vit dans `lib/sse.ts` sous forme de `Map<eventId, Set<controller>>` en mémoire. Un
seul processus applicatif est supposé ; `LISTEN/NOTIFY` ne serait nécessaire qu'en cas de
passage à plusieurs.

Types diffusés :

```txt
participant.rsvp     activity.created     activity.decided
activity.updated     activity.vote        activity.cancelled
expense.created      expense.updated      settlement.declared
settlement.confirmed
```

`activity.updated` a été ajouté à cette liste au jalon M2 : une activité modifiée doit se
propager comme une activité créée, et `expense.updated` prouve que la symétrie création /
modification était déjà voulue ailleurs.

Les messages ne transportent que `{ type, id }` : le client recharge la ressource concernée.
Cela évite de dupliquer la logique de permissions dans le flux et d'exposer des données à un
destinataire non autorisé.

Une exception : `activity.vote` transporte directement `{ activityId, for, against }`. C'est
l'événement le plus fréquent, son contenu est public pour tous les participants, et c'est le
compteur qui doit bouger en direct.

Robustesse : battement de cœur toutes les 30 secondes, mise en tampon du reverse proxy
désactivée, HTTP/2 pour éviter la limite de six connexions par domaine. À la reconnexion, le
client resynchronise en rechargeant l'état complet ; aucun journal d'événements n'est
conservé pour rejouer l'historique.

---

## 6. Front

### 6.1 Routes

```txt
/                    tableau de bord : événements à venir, notifications
/login
/invite/:token       consommation d'un lien, puis redirection
/me/calendar         indisponibilités personnelles
/friends
/groups              /groups/:id  membres et calendrier partagé
/events/new
/events/:id          onglets : Programme · Dépenses · Participants
```

### 6.2 État

Deux magasins Pinia globaux : `useSession` et `useNotifications`. L'état d'un événement vit
dans un composable `useEvent(id)` monté et détruit avec la vue — un magasin global produirait
de l'état périmé lors d'une navigation entre événements.

### 6.3 Client typé

```ts
import { hc } from 'hono/client'
import type { AppType } from '@api/main'

export const api = hc<AppType>('/api')
```

Un alias Vite `@api` pointe vers `api/src`. Le type traverse la frontière sans génération de
code ni contrat OpenAPI.

### 6.4 Flux temps réel

`useEventStream(eventId)` monté avec la vue d'un événement, `useNotificationStream()` monté
une seule fois dans `App.vue`. À réception, invalidation ciblée puis rechargement — sauf
`activity.vote`, dont le décompte est appliqué directement.

### 6.5 Carte

Un composant `MapView` recevant une liste de points ordonnés. Leaflet est instancié dans
`onMounted` sur une `ref` et détruit dans `onUnmounted`. Aucun greffon de wrapper.

### 6.6 Style et états d'interface

Tailwind, plus une poignée de composants locaux (bouton, champ, modale, onglets). Aucune
bibliothèque de composants complète : sa configuration coûterait plus cher que les vingt
composants réellement nécessaires.

Chaque vue traite explicitement quatre cas : chargement, vide, erreur, succès.

---

## 7. Tests

Vitest des deux côtés, un seul lanceur pour les deux espaces de travail.

### 7.1 Unitaires, sans entrées-sorties

C'est là que porte l'effort, parce que c'est là qu'est le risque.

```txt
lib/money.ts
  3 personnes, 10,00 €        → 3,34 / 3,33 / 3,33, somme = 10,00
  7 personnes, 100,01 €       → invariant respecté
  parts en pourcentage dont le total n'est pas 100 → rejet
  minimisation : 5 personnes, 12 dépenses → au plus 4 virements
  tous les soldes nuls        → aucun virement

lib/vote.ts          décompte, changement d'avis, abstention
lib/permissions.ts   matrice de la section 3.8
```

### 7.2 Intégration

Routes exécutées contre un PostgreSQL réel, une transaction par test annulée à la fin.

- une dépense modifiée après un règlement déclaré : le delta réapparaît, le règlement est
  intact ;
- un participant qui rejoint tardivement : les parts existantes ne changent pas ;
- deux indisponibilités qui se chevauchent : fusionnées en une seule, sous concurrence ;
- token d'invitation expiré, révoqué, déjà consommé ;
- un non-administrateur qui tente de trancher une activité : 403 ;
- adresse connue et adresse inconnue : réponses identiques.

La couverture de la tuyauterie CRUD n'est pas un objectif.

---

## 8. Erreurs et observabilité

Forme de réponse unique : `{ code, message, details }`. Validation `zod` à la frontière,
contraintes PostgreSQL en dernière ligne — une règle appliquée par la base ne peut pas être
contournée par un chemin de code oublié.

Aucun détail interne dans une réponse d'erreur. Identifiant de requête dans les journaux,
Sentry côté API et côté front.

---

## 9. Séquencement

Chaque jalon laisse une application démontrable.

| Jalon  | Contenu                                                                  | Démonstration                                      |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------- |
| **M0** | Node + Hono, PostgreSQL Docker, Prisma, migration initiale, Better Auth  | Connexion                                          |
| **M1** | Événement, lien, invitation par e-mail, RSVP, participants               | Un tiers rejoint un événement depuis son téléphone |
| **M2** | Activités, vote, SSE, décision de l'administrateur                       | Le décompte bouge en direct sur deux écrans        |
| **M3** | Dépenses, parts, présence, soldes, virements minimisés, règlement        | Quatre virements au lieu de dix                    |
| **M4** | Groupes, calendrier partagé, superposition des indisponibilités          | Le créneau qui convient à tous                     |
| **M5** | Carte Leaflet, géocodage BAN, pins ordonnés                              | Le programme sur une carte                         |
| **M6** | Amis, notifications complètes                                            |                                                    |
| **M7** | Finitions : pourcentage et montant fixe, réordonnancement, annulation    |                                                    |

**Point de coupe** : à l'issue de M3, le produit est cohérent et se défend seul. M4 à M7
s'ajoutent dans l'ordre du temps restant.

Le calendrier partagé passe devant la carte : c'est le différenciateur du sujet, la carte est
un agrément. En cas de coupe, mieux vaut perdre la carte.

**Le déploiement est un livrable de M1**, dont la démonstration suppose une URL publique.

---

## 10. Points ouverts

1. **Relance des non-votants.** Hors périmètre : elle demanderait une tâche planifiée.
2. **Chaîne de déploiement.** Non définie ; un VPS est disponible. À trancher avant M1.
3. **Caractéristiques du VPS**, qui conditionnent la faisabilité d'un Photon auto-hébergé.
