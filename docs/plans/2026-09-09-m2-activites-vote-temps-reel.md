# Jalon M2 — activités, vote, décision, temps réel

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** dans un événement, un participant propose une activité ; les autres votent pour ou
contre et peuvent changer d'avis ; l'administrateur tranche. **Le décompte bouge en direct
sur deux écrans** — c'est la démonstration de M2.

**Conception :** [`../conception.md`](../conception.md) — sections 2.7, 3.3, 3.8, 5.1, 5.2,
6.1, 6.4, 7.1, 9. **Fait autorité.**
**Décisions :** [`../decisions-techniques.md`](../decisions-techniques.md) — 2.11, 3.4.
**Versions :** [`../versions.md`](../versions.md) — aucune montée dans ce jalon.
**Jalon précédent :** [`2026-09-09-m1-evenement-invitations-participants.md`](2026-09-09-m1-evenement-invitations-participants.md).

## Contraintes globales

- Node **24.20.0** (`.nvmrc`). Versions **épinglées à l'exact**, aucune montée dans M2.
- **Une migration par jalon.** M2 ajoute exactement deux tables : `activities` et
  `activity_votes`. Voir « Ce que M2 ne crée pas » ci-dessous.
- Portes de vérification avant **chaque** commit, dans l'ordre :
  `npx biome check --write .` puis `npm run typecheck` puis `npm test`.
- **Ne jamais lancer la correction automatique de Biome sur un `.vue`.**
- Messages de commit en anglais, Conventional Commits, corps expliquant *pourquoi*.
  **Aucune ligne d'attribution.** Commits signés (`git commit -S`).
- **Forme d'erreur uniforme** `{ code, message, details }` via `ApiError` — jamais de corps
  d'erreur construit à la main dans une route.
- `npm test` vide la base : relancer `npm run db:seed` avant toute démonstration.

## Périmètre

**Dans M2 :**

| Domaine | Contenu |
| --- | --- |
| Base | Modèles `Activity`, `ActivityVote` + enums, migration `m2_activities` |
| Pur | `lib/vote.ts` — décompte, changement d'avis, abstention |
| Pur | `lib/sse.ts` — bus de diffusion en mémoire, `Map<eventId, Set<client>>` |
| Permissions | `canProposeActivity(rsvp)`, `canVote(rsvp)`, `canDecideActivity(role)` |
| API | `POST/GET /api/events/:id/activities`, `PATCH /api/activities/:id`, `POST /api/activities/:id/vote`, `POST /api/activities/:id/decision`, `GET /api/events/:id/stream` |
| Front | Onglet **Programme** actif : liste, proposition, vote, décision ; `useEventStream` |

**Hors M2 — appartient à un jalon nommé, ne pas anticiper :**

| Écarté | Jalon | Motif |
| --- | --- | --- |
| `POST /activities/:id/attendance`, table `activity_absences`, colonne `attendance_mode` | **M3** | La présence sert à pré-remplir une dépense (§3.4) ; M3 porte « dépenses, parts, **présence** » |
| Colonnes `lat`, `lng` | **M5** | Elles arrivent avec le géocodage BAN et la carte |
| `POST /activities/:id/cancel`, colonne `cancelled_at` | **M7** | §9 range l'**annulation** en M7 |
| `PATCH /events/:id/activities/order` | **M7** | §9 range le **réordonnancement** en M7 |
| `GET /me/stream`, table `notifications` | **M6** | §9 range les notifications en M6 |

Ces cinq lignes figurent pourtant à la section 5.1 ou 2.7 de la conception, qui décrit le
modèle **final**. Le tableau des jalons §9 dit *quand*. Les deux ne se contredisent pas :
§2.7 est la cible, §9 le séquencement, et `workflow.md` tranche — « on ne crée pas
aujourd'hui des tables que personne n'écrit encore ».

**Ce que M2 ne crée pas dans `activities`,** bien que §2.7 les liste : `lat`, `lng`,
`attendance_mode`, `cancelled_at`. Chacune arrive avec la fonctionnalité qui l'écrit, par une
migration d'une ligne. `address` est conservée dès M2 : c'est un champ libre « où est-ce ? »,
utile sans géocodage, et §2.7 la distingue de `lat`/`lng`.

---

## Décisions de ce jalon à consigner

À reporter dans [`../journal-decisions.md`](../journal-decisions.md), avec leur coût :

1. **`GET /api/events/:id/activities` ajouté à la surface HTTP.** §5.1 ne liste pas de route
   de lecture, mais §5.2 impose que le client « recharge la ressource concernée » à réception
   d'un message SSE. Sans route dédiée, il faudrait recharger l'événement entier à chaque
   vote. §5.1 est corrigé dans le même commit. *Coût si erroné : une route à retirer.*
2. **Un vote référence un `participant_id`, pas un `user_id`** — c'est la clé primaire de
   §2.7. Elle lie le vote à une participation : quitter l'événement emporte le vote, et la
   clé primaire `(activity_id, participant_id)` interdit le double vote sans code.
3. **Modifier une activité est réservé à son proposant et aux administrateurs.** La matrice
   §3.8 ne tranche pas ce cas. *Coût si erroné : une condition à élargir.*
4. **Le bus SSE est un module à état, testé sans HTTP.** `lib/sse.ts` expose
   `subscribe`/`publish` sur des objets simples ; la route Hono n'en est qu'un adaptateur.
   C'est ce qui rend le temps réel testable sans ouvrir de socket.
5. **`activity.vote` transporte son décompte, les autres messages non.** Exception explicite
   de §5.2 : c'est l'événement le plus fréquent, son contenu est public pour tous les
   participants, et c'est le compteur qui doit bouger en direct.

---

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `api/prisma/schema.prisma` | + `Activity`, `ActivityVote`, enums `ActivityStatus`, `VoteValue` |
| `api/prisma/migrations/<h>_m2_activities/migration.sql` | Migration générée |
| `api/src/lib/vote.ts` | `tally(votes)` — fonction pure |
| `api/src/lib/sse.ts` | Bus de diffusion en mémoire |
| `api/src/lib/permissions.ts` | + `canProposeActivity`, `canVote`, `canDecideActivity` |
| `api/src/modules/activities/schema.ts` | Schémas zod |
| `api/src/modules/activities/service.ts` | Règles métier |
| `api/src/modules/activities/routes.ts` | Sous-routeur monté sur `/api/activities` |
| `api/src/modules/events/routes.ts` | + `POST/GET /:id/activities`, `GET /:id/stream` |
| `api/tests/helpers/db.ts` | `TABLES` étendu à `activity_votes`, `activities` |
| `web/src/composables/useActivities.ts` | Liste, proposition, vote, décision |
| `web/src/composables/useEventStream.ts` | `EventSource`, monté et détruit avec la vue |
| `web/src/views/EventView.vue` | Onglet **Programme** actif |
| `web/src/components/ActivityCard.vue` | Une activité : décompte, boutons de vote, décision |

---

## Tâche 1 : décompte des votes

C'est la fonction pure du jalon : `conception.md` §7.1 la nomme explicitement, et
`workflow.md` place l'effort de test sur les fonctions sans entrées-sorties.

**Fichiers :** créer `api/src/lib/vote.ts`, `api/tests/lib/vote.test.ts`.

**Interfaces produites :**
- `type VoteValue = 'for' | 'against'`
- `type Tally = { for: number; against: number }`
- `tally(votes: readonly { value: VoteValue }[]): Tally`

- [ ] **Étape 1 — test qui échoue.** `api/tests/lib/vote.test.ts` :
  - aucun vote → `{ for: 0, against: 0 }` ;
  - trois `for` et deux `against` → `{ for: 3, against: 2 }` ;
  - **abstention** : le décompte ne compte que les votes présents, jamais les participants
    silencieux — un tableau de deux votes sur cinq participants donne un total de deux ;
  - **changement d'avis** : le magasin ne garde qu'une ligne par participant (clé primaire
    §2.7), donc `tally` ne voit jamais deux votes du même participant. Le test documente
    l'invariant en comptant une liste déjà dédoublonnée.

  Lancer : `npm test --workspace api -- vote`. Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 2 — implémentation, vérifier, commiter.**
  `git commit -S -m "feat(api): tally activity votes"`

---

## Tâche 2 : bus de diffusion

**Fichiers :** créer `api/src/lib/sse.ts`, `api/tests/lib/sse.test.ts`.

`conception.md` §5.2 : `Map<eventId, Set<controller>>` en mémoire, un seul processus
applicatif supposé. Le bus ne connaît ni Hono ni HTTP — c'est ce qui le rend testable.

**Interfaces produites :**
- `type ServerEvent = { type: string; [key: string]: unknown }`
- `type Subscriber = (event: ServerEvent) => void`
- `subscribe(eventId: string, subscriber: Subscriber): () => void` — rend la fonction de
  désabonnement.
- `publish(eventId: string, event: ServerEvent): void`
- `subscriberCount(eventId: string): number` — pour les tests et la sonde.

- [ ] **Étape 1 — test qui échoue.** `api/tests/lib/sse.test.ts` :
  - un abonné reçoit un message publié sur son événement ;
  - il ne reçoit **pas** un message publié sur un autre événement ;
  - deux abonnés du même événement reçoivent tous les deux — c'est « deux écrans » ;
  - la fonction de désabonnement retire l'abonné, et `subscriberCount` retombe à zéro ;
  - se désabonner deux fois ne lève pas ;
  - **un abonné qui lève n'empêche pas les autres de recevoir.** Une connexion morte ne doit
    pas faire taire le flux des autres.

  Lancer : `npm test --workspace api -- sse`. Attendu : ÉCHEC.

- [ ] **Étape 2 — implémentation.** `Map<string, Set<Subscriber>>`. À la publication, itérer
  sur une **copie** du `Set` (un abonné peut se désabonner pendant la diffusion) et entourer
  chaque appel d'un `try/catch` qui journalise. Retirer la clé quand le `Set` se vide, sinon
  la carte fuit un `Set` vide par événement jamais rouvert.

- [ ] **Étape 3 — vérifier, commiter.**
  `git commit -S -m "feat(api): broadcast server-sent events through an in-memory bus"`

---

## Tâche 3 : permissions du vote

**Fichiers :** modifier `api/src/lib/permissions.ts`, `api/tests/lib/permissions.test.ts`.

`conception.md` §3.8, lignes qui concernent M2 :

| Action | Autorisé à |
| --- | --- |
| Trancher le vote d'une activité | administrateur de l'événement |
| Proposer une activité, voter | participant **ayant accepté** |

Le second point est le piège : être participant ne suffit pas, il faut `rsvp = 'accepted'`.
Un invité qui n'a pas répondu, ou qui a décliné, ne propose ni ne vote.

**Interfaces produites :**
- `canProposeActivity(rsvp: Rsvp): boolean`
- `canVote(rsvp: Rsvp): boolean`
- `canDecideActivity(role: ParticipantRole): boolean`
- `type Rsvp = 'invited' | 'accepted' | 'declined'` (union locale, comme `ParticipantRole`)

- [ ] **Étape 1 — test qui échoue.** Matrice exhaustive, les trois valeurs de `rsvp` pour
  chacune des deux premières fonctions, les deux rôles pour la troisième.

  Lancer : `npm test --workspace api -- permissions`. Attendu : ÉCHEC.

- [ ] **Étape 2 — implémentation, vérifier, commiter.**
  `git commit -S -m "feat(api): restrict proposing and voting to accepted participants"`

---

## Tâche 4 : modèles et migration

**Fichiers :** modifier `api/prisma/schema.prisma`, `api/tests/helpers/db.ts` ; créer
`api/prisma/migrations/<h>_m2_activities/migration.sql`, `api/tests/schema-m2.test.ts`.

```prisma
enum ActivityStatus { proposed accepted rejected }
enum VoteValue      { for against }

model Activity {
  id          String         @id @default(uuid())
  eventId     String         @map("event_id")
  event       Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  title       String
  kind        String         @default("")
  address     String         @default("")
  startsAt    DateTime?      @map("starts_at")
  endsAt      DateTime?      @map("ends_at")
  position    Int            @default(0)
  status      ActivityStatus @default(proposed)
  proposedBy  String         @map("proposed_by")
  proposer    EventParticipant @relation(fields: [proposedBy], references: [id], onDelete: Cascade)
  createdAt   DateTime       @default(now()) @map("created_at")
  votes       ActivityVote[]

  @@index([eventId, position])
  @@map("activities")
}

model ActivityVote {
  activityId    String           @map("activity_id")
  activity      Activity         @relation(fields: [activityId], references: [id], onDelete: Cascade)
  participantId String           @map("participant_id")
  participant   EventParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  value         VoteValue
  updatedAt     DateTime         @updatedAt @map("updated_at")

  @@id([activityId, participantId])
  @@map("activity_votes")
}
```

Ajouter à `EventParticipant` les relations inverses : `proposedActivities Activity[]` et
`votes ActivityVote[]`.

`proposedBy` référence `event_participants.id` et non `user.id` : le proposant est une
**participation**, cohérent avec `activity_votes.participant_id` de §2.7.

- [ ] **Étape 1 — test qui échoue.** `api/tests/schema-m2.test.ts`, en base réelle :
  - créer utilisateur, événement, participation, activité ; relire avec ses votes ;
  - un second vote du même participant sur la même activité est **rejeté** (clé primaire) ;
  - supprimer l'événement emporte ses activités et leurs votes (cascade) ;
  - une activité naît en `proposed`.

  Lancer : `npm test --workspace api -- schema-m2`. Attendu : ÉCHEC.

- [ ] **Étape 2 — générer la migration.**
  `npm run db:migrate --workspace api -- --name m2_activities`.

  **Si la migration doit être retouchée après application**, ne pas éditer le `.sql` déjà
  appliqué : sa somme de contrôle deviendrait fausse. Reconstruire le schéma —
  `docker exec onsort-db psql -U onsort -d onsort -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'`
  — puis réappliquer. `prisma migrate reset` est refusé aux agents.

- [ ] **Étape 3 — étendre `resetDatabase`.** `TABLES` devient :
  `['activity_votes', 'activities', 'invitations', 'invite_links', 'event_participants', 'events', 'session', 'account', 'verification', 'user']`.

- [ ] **Étape 4 — vérifier, commiter.**
  `git commit -S -m "feat(api): add the activity and vote models"`

---

## Tâche 5 : proposer et lire les activités

**Fichiers :** créer `api/src/modules/activities/schema.ts`, `.../service.ts` ;
`api/tests/modules/activities.test.ts` ; modifier `api/src/modules/events/routes.ts`.

**Règles :**
- `POST /api/events/:id/activities` — corps `{ title, kind?, address?, startsAt?, endsAt? }`.
  **Réservé au participant ayant accepté** (`canProposeActivity`), sinon 403
  `must_accept_first`. Naît en `proposed`. `position` = nombre d'activités existantes.
  Si `startsAt` et `endsAt` sont tous deux fournis, `endsAt > startsAt`, sinon 400
  `invalid_period`. Réponse 201 `{ id }`.
- `GET /api/events/:id/activities` — **tout participant**, y compris qui n'a pas répondu :
  on peut consulter le programme avant de se décider. Réponse
  `{ activities: [{ id, title, kind, address, startsAt, endsAt, position, status, proposedBy: { participantId, name }, tally: { for, against }, myVote: 'for' | 'against' | null }] }`,
  triée par `position` croissante. `tally` vient de `lib/vote.ts`.

- [ ] **Étape 1 — tests qui échouent :**
  - proposer sans session → 401 ;
  - proposer en tant que non-participant → 403 `not_a_participant` ;
  - proposer avec `rsvp = 'invited'` → 403 `must_accept_first` ;
  - proposer avec `rsvp = 'declined'` → 403 `must_accept_first` ;
  - proposer avec `rsvp = 'accepted'` → 201, activité en `proposed` en base ;
  - `endsAt` antérieur à `startsAt` → 400 `invalid_period` ;
  - deux activités successives reçoivent `position` 0 puis 1 ;
  - lire la liste en tant que participant `invited` → 200 (consultation permise) ;
  - lire en tant que non-participant → 403 `not_a_participant` ;
  - la liste rend `tally` à zéro et `myVote` à `null` quand personne n'a voté.

  Lancer : `npm test --workspace api -- modules/activities`. Attendu : ÉCHEC.

- [ ] **Étape 2 — implémenter.** Le service réutilise `loadParticipant` du module
  `events` — l'exporter si ce n'est pas déjà fait. Les routes s'ajoutent au sous-routeur
  `eventsRoutes` existant, chaînées pour l'inférence de `AppType`.

- [ ] **Étape 3 — vérifier, commiter.**
  `git commit -S -m "feat(api): propose activities and read an event programme"`

---

## Tâche 6 : voter, et diffuser le décompte

**Fichiers :** modifier `.../schema.ts`, `.../service.ts` ; créer
`api/src/modules/activities/routes.ts` ; modifier `api/src/main.ts` ;
`api/tests/modules/activities.test.ts`.

**Règles (§3.3) :**
- `POST /api/activities/:id/vote` — corps `{ value: 'for' | 'against' }`. Réservé au
  participant **ayant accepté**. Un second vote **remplace** le premier (`upsert` sur la clé
  primaire) : changer d'avis est explicitement prévu. Refusé si l'activité n'est plus
  `proposed` → 409 `activity_already_decided`.
- Après écriture, **publier** sur le bus :
  `{ type: 'activity.vote', activityId, for, against }` — l'exception de §5.2, seul message
  qui transporte son contenu.
- Réponse : le décompte à jour `{ for, against }`.

- [ ] **Étape 1 — tests qui échouent :**
  - voter avec `rsvp = 'invited'` → 403 `must_accept_first` ;
  - voter `for` → 200, décompte `{ for: 1, against: 0 }`, une ligne en base ;
  - **changer d'avis** : voter `for` puis `against` → toujours **une seule** ligne, décompte
    `{ for: 0, against: 1 }` ;
  - deux participants votant en sens contraire → `{ for: 1, against: 1 }` ;
  - voter sur une activité déjà tranchée → 409 `activity_already_decided` ;
  - **un abonné au bus reçoit `activity.vote` avec le décompte** — s'abonner via
    `subscribe(eventId, …)` avant d'appeler la route, et vérifier le message reçu.

- [ ] **Étape 2 — implémenter, vérifier, commiter.**
  `git commit -S -m "feat(api): cast and change a vote, broadcasting the tally"`

---

## Tâche 7 : trancher, et modifier une activité

**Fichiers :** modifier `.../service.ts`, `.../routes.ts`, `api/tests/modules/activities.test.ts`.

**Règles (§3.3, §3.8) :**
- `POST /api/activities/:id/decision` — corps `{ status: 'accepted' | 'rejected' }`.
  **Administrateur de l'événement uniquement** (`canDecideActivity`), sinon 403 `forbidden`.
  Sans échéance ni quorum : l'administrateur peut retenir une activité minoritaire — le vote
  informe la décision, il ne la contraint pas. **Aucun état absorbant** : revenir à
  `proposed` est autorisé, ce qui rouvre le vote. Publier
  `{ type: 'activity.decided', id }`.
- `PATCH /api/activities/:id` — corps partiel `{ title?, kind?, address?, startsAt?, endsAt? }`.
  Réservé au **proposant ou à un administrateur** (décision 3), sinon 403 `forbidden`.
  L'invariant de période est revérifié sur les valeurs résultantes. Publier
  `{ type: 'activity.updated', id }`.

- [ ] **Étape 1 — tests qui échouent :**
  - trancher en tant que participant `member` → 403 `forbidden` ;
  - trancher en tant qu'administrateur → 200, statut en base ;
  - `accepted` puis `proposed` → les deux réussissent, et le vote redevient possible ;
  - modifier en tant que tiers → 403 ; en tant que proposant → 200 ; en tant qu'admin → 200 ;
  - un abonné reçoit `activity.decided` puis `activity.updated`.

- [ ] **Étape 2 — implémenter, vérifier, commiter.**
  `git commit -S -m "feat(api): let an admin decide an activity and edit its details"`

---

## Tâche 8 : le flux SSE

**Fichiers :** modifier `api/src/modules/events/routes.ts`, `api/tests/modules/stream.test.ts`.

**Règles (§5.2) :**
- `GET /api/events/:id/stream` — session requise, **participant uniquement** (403 sinon).
  `streamSSE` de Hono. Abonnement au bus à l'ouverture, **désabonnement à la fermeture**
  (`stream.onAbort`) — sans quoi le bus fuit un abonné par onglet fermé.
- **Battement de cœur toutes les 30 secondes** : un commentaire SSE (`: ping`) suffit et ne
  déclenche pas de `message` côté client.
- En-têtes : `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
  `X-Accel-Buffering: no` (désactive la mise en tampon d'un mandataire, §5.2).

- [ ] **Étape 1 — tests qui échouent.** Un flux ouvert ne se ferme pas seul : chaque test
  **doit** couper la connexion, sinon Vitest reste suspendu. Utiliser un `AbortController`
  passé à `app.request` et l'abandonner à la fin du test.
  - sans session → 401 ;
  - en tant que non-participant → 403 ;
  - en tant que participant → 200, `content-type` valant `text/event-stream` ;
  - **le nombre d'abonnés du bus retombe à zéro après l'abandon** — c'est le test qui prouve
    l'absence de fuite.

- [ ] **Étape 2 — implémenter, vérifier, commiter.**
  `git commit -S -m "feat(api): stream event updates over SSE"`

---

## Tâche 9 : l'onglet Programme

**Fichiers :** créer `web/src/composables/useActivities.ts`,
`web/src/components/ActivityCard.vue` ; modifier `web/src/views/EventView.vue` ;
`web/tests/activities.test.ts`.

- [ ] **Étape 1 — test qui échoue.** `useActivities(eventId)` expose
  `state: 'loading' | 'empty' | 'error' | 'ready'`, `activities`, et les actions
  `propose(input)`, `vote(activityId, value)`, `decide(activityId, status)`, `reload()`.
  `fetch` bouchonné : liste vide → `empty` ; liste peuplée → `ready` ; rejet → `error` ;
  `vote` poste puis applique le décompte renvoyé **sans recharger** la liste.

- [ ] **Étape 2 — implémenter.** `ActivityCard` affiche titre, lieu, horaires, statut, le
  décompte `pour / contre`, deux boutons de vote dont l'actuel est mis en évidence, et — pour
  un administrateur — **Retenir** / **Écarter**. Les boutons de vote sont désactivés si
  l'activité n'est plus `proposed` ou si le lecteur n'a pas accepté l'événement, avec une
  phrase qui dit pourquoi.

- [ ] **Étape 3 — brancher l'onglet.** `EventView` : onglets **Programme** et
  **Participants** réellement commutables ; **Dépenses** reste désactivé avec « à venir ».

- [ ] **Étape 4 — vérifier, commiter.**
  `git commit -S -m "feat(web): show the programme and let participants vote"`

---

## Tâche 10 : le temps réel côté front

**Fichiers :** créer `web/src/composables/useEventStream.ts` ; modifier
`web/src/views/EventView.vue` ; `web/tests/stream.test.ts`.

**Règles (§6.4) :** `useEventStream(eventId, handlers)` monté avec la vue, **fermé dans
`onUnmounted`**. À réception : invalidation ciblée puis rechargement — **sauf
`activity.vote`, dont le décompte est appliqué directement**, sans requête.

- [ ] **Étape 1 — test qui échoue.** `EventSource` n'existe pas dans happy-dom : le
  bouchonner via `vi.stubGlobal('EventSource', …)` avec une fausse classe exposant
  `addEventListener` et `close`.
  - un message `activity.vote` appelle le gestionnaire de décompte, **jamais** le
    rechargement ;
  - un message `activity.created` appelle le rechargement ;
  - `close()` est appelé au démontage — monter dans un composant de test et le détruire.

- [ ] **Étape 2 — implémenter, brancher dans `EventView`.**

- [ ] **Étape 3 — la démonstration, à la main.** `npm run db:seed && npm run dev`. Deux
  navigateurs, deux comptes, **le même événement ouvert des deux côtés**. L'un vote : le
  décompte de l'autre bouge **sans rechargement**. C'est la démonstration du jalon ; elle ne
  peut pas être validée autrement que par un humain devant deux écrans.

- [ ] **Étape 4 — vérifier, commiter.**
  `git commit -S -m "feat(web): move the tally live over the event stream"`

---

## Tâche 11 : documentation

**Fichiers :** `docs/conception.md` (§5.1), `docs/journal-decisions.md`, `docs/workflow.md`,
`README.md`, `CLAUDE.md`.

- [ ] Ajouter `GET /events/:id/activities` à §5.1 de la conception.
- [ ] Consigner les cinq décisions ci-dessus dans le journal, chacune avec son coût.
- [ ] `CLAUDE.md` : état actuel → M2 terminé, M3 suivant. Ajouter aux pièges le point qui
      coûtera du temps à quelqu'un : **un test qui ouvre un flux SSE sans l'abandonner
      suspend Vitest indéfiniment.**
- [ ] `README.md` : un paragraphe « Voir le décompte bouger en direct ».
- [ ] `docs/workflow.md` : marquer M2 terminé.

- [ ] **Commiter.** `git commit -S -m "docs: record the M2 stream route and its decisions"`

---

## Critère d'achèvement de M2

- [ ] `npm ci && npm run db:generate && npx prisma migrate deploy --config api/prisma.config.ts --schema api/prisma/schema.prisma && npx biome ci . && npm run typecheck && npm test && npm run build` passe.
- [ ] Un participant ayant accepté propose une activité ; un autre vote ; un troisième change
      d'avis et le décompte le reflète.
- [ ] Un invité n'ayant pas répondu **ne peut ni proposer ni voter**, et l'interface le dit.
- [ ] L'administrateur tranche, y compris contre la majorité, et peut rouvrir le vote.
- [ ] **Le décompte bouge en direct sur deux écrans**, sans rechargement.
- [ ] Fermer un onglet retire son abonné du bus.
- [ ] Les vues traitent les quatre états d'interface ; utilisables à 375 px.
