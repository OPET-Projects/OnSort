# Jalon M1 — événement, invitations, participants

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** un utilisateur crée un événement, en fixe la date, invite un tiers par lien
partageable ou par adresse e-mail ; ce tiers s'authentifie, rejoint l'événement, et chacun
voit la liste des participants avec leur réponse. C'est la démonstration de M1 : « un tiers
rejoint un événement depuis son téléphone ».

**Conception :** [`../conception.md`](../conception.md) — sections 2.5, 2.6, 3.1, 3.2, 3.8,
4, 5.1, 6.1, 9. **Fait autorité.**
**Décisions :** [`../decisions-techniques.md`](../decisions-techniques.md) — 2.11, 3.3.
**Versions :** [`../versions.md`](../versions.md) — aucune montée dans ce jalon.

## Contraintes globales

- Node **24.20.0** (`.nvmrc`). Versions **épinglées à l'exact**, aucune montée dans M1.
- **Une migration par jalon.** M1 ajoute exactement quatre tables : `events`,
  `event_participants`, `invite_links`, `invitations`. Aucune table de M2+.
- Prisma 7 : l'URL de connexion reste dans `api/prisma.config.ts`, jamais dans le schéma.
  Le client généré (`api/src/generated/`) n'est pas versionné.
- Format et lint par Biome. **Ne jamais lancer la correction automatique de Biome sur un
  `.vue`.** Portes de vérification avant **chaque** commit, dans l'ordre :
  `npx biome check --write .` puis `npm run typecheck` puis `npm test`.
- Messages de commit en anglais, Conventional Commits, corps expliquant *pourquoi*.
  **Aucune ligne d'attribution.** Commits signés (`git commit -S`).
- **Anti-énumération de comptes.** Inviter une adresse renvoie toujours la même réponse —
  même corps, même code HTTP — que le compte existe ou non (conception §4).
- **Forme d'erreur uniforme** `{ code, message, details }`, `details` toujours présent.
- **Aucun état de la machine à états d'un événement n'est absorbant** (conception §3.1).
- Argent : sans objet dans M1.

## Périmètre

**Dans M1 :**

| Domaine | Contenu |
| --- | --- |
| Base | Modèles `Event`, `EventParticipant`, `InviteLink`, `Invitation` + migration `m1_events` |
| Erreurs | Classe `ApiError` typée, rendue par le gestionnaire global ; `requireSession` la lève |
| Jetons | `lib/tokens.ts` — génération et hachage d'un jeton de lien d'invitation |
| Permissions | `lib/permissions.ts` — `canManageEvent(role)` (matrice §3.8, sous-ensemble M1) |
| API événements | `POST /api/events`, `GET /api/events`, `GET /api/events/:id`, `PATCH /api/events/:id`, `POST /api/events/:id/rsvp`, `POST /api/events/:id/invitations` |
| API invitations | `POST /api/invitations/:token/accept` |
| Courriel | Courriel d'invitation via le `mailer` existant (repli console) |
| Front | Routes `/events/new`, `/events/:id`, `/invite/:token` ; tableau de bord `/` listant les événements |

**Hors M1, malgré une apparence proche dans `conception.md` §5.1 :**

- **SSE** (`GET /api/events/:id/stream`) — le tableau des jalons (§9) le place en M2
  (« Activités, vote, SSE »). `lib/sse.ts` arrive avec M2.
- Activités, votes, dépenses, groupes, calendrier, amis, notifications internes.
- La table `notifications` (§2.9) et les types d'événements qu'elle porte arrivent avec M6.

**Livrable d'infrastructure de M1 — déploiement.** `conception.md` §9 et
`decisions-techniques.md` §2.10 font du déploiement (URL publique + HTTPS) un livrable de
M1. Il n'est **pas** couvert par ce plan de code : il dépend d'un accès au VPS de
l'intervenant. À traiter séparément une fois la chaîne de livraison tranchée (point ouvert
`conception.md` §10.2).

---

## Décisions de ce jalon à consigner

À reporter dans [`../journal-decisions.md`](../journal-decisions.md), avec leur coût :

1. **`GET /api/events` ajouté à la surface HTTP.** `conception.md` §5.1 ne liste pas de
   route de liste, mais le tableau de bord §6.1 (« événements à venir ») en exige une.
   `conception.md` §5.1 est corrigé dans le même commit. *Coût si erroné : une route à
   retirer.*
2. **Aucune clé étrangère sur `invite_links.target_id` ni `invitations.target_id`.** Le
   modèle de `conception.md` §2.6 est polymorphe (`scope group|event`). Une FK vers `events`
   casserait dès l'arrivée des invitations de groupe en M4. L'existence de la cible est
   vérifiée en couche service. *Coût si erroné : une FK à ajouter, une migration.*
3. **Le lien d'une invitation nominative porte l'`id` de l'invitation comme jeton.** La
   table `invitations` de `conception.md` §2.6 n'a pas de colonne jeton, par conception.
   `POST /api/invitations/:token/accept` résout `:token` d'abord contre le hachage d'un
   `invite_links`, puis contre l'`id` d'une `invitations`, et revérifie alors l'identité de
   l'appelant (`invited_user_id` ou `invited_email`). *Coût si erroné : un schéma de route à
   revoir.*
4. **Les courriels d'invitation partent en tâche de fond (`void mailer.send(...)`),** sans
   bloquer la réponse ni la faire échouer. Cohérent avec la file d'attente d'envoi classée
   « recommandation retirée » (`decisions-techniques.md` §6) et avec la règle « ne jamais
   appeler Resend depuis un handler HTTP » lue au sens de « ne pas attendre l'envoi ». Une
   erreur d'envoi est journalisée. *Coût si erroné : un envoi perdu sans relance ; à
   corriger par un `outbox` au passage en production.*
5. **`requireSession` lève désormais `ApiError`** au lieu de renvoyer un JSON en ligne.
   Sortie identique pour le client. Fait tant qu'une seule route diverge. *Coût si erroné :
   un intergiciel à réaligner.*

---

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `api/prisma/schema.prisma` | + modèles `Event`, `EventParticipant`, `InviteLink`, `Invitation` et enums |
| `api/prisma/migrations/<h>_m1_events/migration.sql` | Migration générée, + `CHECK` sur `invitations` ajouté à la main |
| `api/src/lib/http.ts` | `ApiError`, et `renderApiError` pour le gestionnaire global |
| `api/src/lib/tokens.ts` | `generateInviteToken()`, `hashInviteToken(raw)` |
| `api/src/lib/permissions.ts` | `canManageEvent(role: ParticipantRole): boolean` |
| `api/src/modules/events/schema.ts` | Schémas zod des corps de requête |
| `api/src/modules/events/service.ts` | Règles métier : création, lecture, mise à jour, RSVP, invitation |
| `api/src/modules/events/routes.ts` | Sous-routeur Hono monté sur `/api/events` |
| `api/src/modules/invitations/service.ts` | Résolution et consommation d'un jeton |
| `api/src/modules/invitations/routes.ts` | Sous-routeur Hono monté sur `/api/invitations` |
| `api/src/main.ts` | Montage des sous-routeurs, `onError` branché sur `renderApiError` |
| `api/src/middleware/session.ts` | Lève `ApiError` |
| `api/tests/helpers/auth.ts` | `signIn(email)` → `Headers` porteuses du cookie de session |
| `api/tests/helpers/db.ts` | `TABLES` étendu aux quatre nouvelles tables |
| `web/src/lib/api.ts` | inchangé (client déjà typé) |
| `web/src/stores/events.ts` | *non* — l'état d'un événement vit dans un composable, pas un store (conception §6.2) |
| `web/src/composables/useEvent.ts` | Chargement d'un événement, monté/détruit avec la vue |
| `web/src/views/EventCreateView.vue` | Formulaire de création |
| `web/src/views/EventView.vue` | Détail : infos, participants, RSVP, panneau d'invitation (admin) |
| `web/src/views/InviteAcceptView.vue` | Consommation d'un jeton, puis redirection |
| `web/src/views/HomeView.vue` | + liste des événements, quatre états d'interface |
| `web/src/views/LoginView.vue` | Lit `?redirect=` et le passe en `callbackURL` |
| `web/src/router.ts` | + trois routes, garde inchangée |

---

## Tâche 1 : erreur d'API typée

Les tâches suivantes ajoutent une dizaine de routes. Sans forme d'erreur centralisée,
chacune réinvente le `{ code, message, details }` et l'une finira par diverger — exactement
ce que le journal des décisions relate pour M0.

**Fichiers :** créer `api/src/lib/http.ts`, `api/tests/lib/http.test.ts` ; modifier
`api/src/main.ts`, `api/src/middleware/session.ts`, `api/tests/routes.test.ts` (au besoin).

**Interfaces produites :**
- `class ApiError extends Error` avec `code: string`, `status: ContentfulStatusCode`,
  `details: Record<string, unknown>` (défaut `{}`).
- `renderApiError(error, c)` : `ErrorHandler` Hono. Une `ApiError` devient sa réponse ; toute
  autre exception devient le 500 `internal_error` actuel, le détail étant journalisé et
  jamais renvoyé.

- [ ] **Étape 1 — test qui échoue.** `api/tests/lib/http.test.ts` :
  - une route qui `throw new ApiError('event_not_found', 404, 'Événement introuvable')`
    répond 404, corps `{ code: 'event_not_found', message: 'Événement introuvable', details: {} }` ;
  - une `ApiError` avec `details: { field: 'endsAt' }` propage ce `details` ;
  - une exception nue (`throw new Error('secret')`) répond 500
    `{ code: 'internal_error', message: 'Une erreur interne est survenue.', details: {} }`
    et « secret » apparaît dans `console.error`, jamais dans le corps.

  Lancer : `npm test --workspace api -- http`. Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 2 — implémentation.** Écrire `api/src/lib/http.ts`. Déplacer la logique de
  `handleServerError` de `main.ts` dans `renderApiError`, en ajoutant la branche `ApiError`
  en tête. `main.ts` importe et branche `renderApiError` sur `.onError(...)` ; garder
  l'export `handleServerError` comme alias si `routes.test.ts` s'en sert, sinon adapter ce
  test.

- [ ] **Étape 3 — `requireSession` lève `ApiError`.** Dans `api/src/middleware/session.ts`,
  remplacer le `return c.json({ code: 'unauthenticated', ... }, 401)` par
  `throw new ApiError('unauthenticated', 401, 'Authentification requise')`. Le test existant
  `refuse /api/me sans session` doit rester vert (sortie identique).

- [ ] **Étape 4 — vérifier.** `npm test --workspace api` : tout vert.
  `npx biome check --write . && npm run typecheck`.

- [ ] **Étape 5 — commiter.**
  `git commit -S -m "feat(api): add a typed API error rendered by the global handler"`

---

## Tâche 2 : jetons de lien d'invitation

Un lien partageable porte un secret. La base n'en stocke que le hachage : une fuite de la
table ne doit pas livrer de liens utilisables (conception §2.6, `token_hash`).

**Fichiers :** créer `api/src/lib/tokens.ts`, `api/tests/lib/tokens.test.ts`.

**Interfaces produites :**
- `generateInviteToken(): string` — 32 octets aléatoires, encodés base64url (URL-sûrs).
- `hashInviteToken(raw: string): string` — SHA-256 hexadécimal.

- [ ] **Étape 1 — test qui échoue.** `api/tests/lib/tokens.test.ts` :
  - deux appels à `generateInviteToken()` produisent des valeurs différentes, longues d'au
    moins 40 caractères, sans `+`, `/` ni `=` ;
  - `hashInviteToken(x)` est stable d'un appel à l'autre et différent de `x` ;
  - `hashInviteToken(a) !== hashInviteToken(b)` pour `a !== b`.

  Lancer : `npm test --workspace api -- tokens`. Attendu : ÉCHEC.

- [ ] **Étape 2 — implémentation.** `node:crypto` : `randomBytes(32).toString('base64url')`
  et `createHash('sha256').update(raw).digest('hex')`.

- [ ] **Étape 3 — vérifier et commiter.**
  `git commit -S -m "feat(api): generate and hash invite-link tokens"`

---

## Tâche 3 : permissions d'événement

**Fichiers :** créer `api/src/lib/permissions.ts`, `api/tests/lib/permissions.test.ts`.

**Interfaces produites :**
- `canManageEvent(role: ParticipantRole): boolean` — `true` pour `admin`, `false` pour
  `member`. C'est la ligne « Changer la configuration, clore l'événement » de la matrice
  §3.8, restreinte à ce que M1 utilise (PATCH événement, créer une invitation).

- [ ] **Étape 1 — test qui échoue.** Matrice explicite :
  `canManageEvent('admin') === true`, `canManageEvent('member') === false`.
  Le type `ParticipantRole` est importé de `../src/generated/prisma/*` (enum Prisma) ou
  redéfini localement en union `'admin' | 'member'` si l'import du client généré dans un
  fichier `lib/` est jugé trop couplant — trancher à l'implémentation et le consigner.

  Lancer : `npm test --workspace api -- permissions`. Attendu : ÉCHEC.

- [ ] **Étape 2 — implémentation, vérifier, commiter.**
  `git commit -S -m "feat(api): decide who may manage an event"`

---

## Tâche 4 : modèles et migration

**Fichiers :** modifier `api/prisma/schema.prisma` ; générer
`api/prisma/migrations/<h>_m1_events/migration.sql` ; modifier `api/tests/helpers/db.ts` ;
créer `api/tests/schema-m1.test.ts`.

**Modèles** (respecter `conception.md` §2.5 et §2.6 ; noms de tables en `snake_case` via
`@@map`, colonnes en `snake_case` via `@map`) :

```prisma
enum EventStatus     { draft active closed }
enum ParticipantRole { admin member }
enum Rsvp            { invited accepted declined }
enum InviteScope     { event group }   // `group` inutilisé avant M4, présent pour §2.6
enum InvitationStatus{ pending accepted declined }

model Event {
  id           String   @id @default(uuid())
  groupId      String?   @map("group_id")
  title        String
  description  String   @default("")
  startsAt     DateTime @map("starts_at")
  endsAt       DateTime @map("ends_at")
  status       EventStatus @default(draft)
  createdBy    String   @map("created_by")
  creator      User     @relation("EventCreator", fields: [createdBy], references: [id])
  createdAt    DateTime @default(now()) @map("created_at")
  participants EventParticipant[]
  @@index([groupId])
  @@map("events")
}

model EventParticipant {
  id       String @id @default(uuid())
  eventId  String @map("event_id")
  event    Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId   String @map("user_id")
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  role     ParticipantRole @default(member)
  rsvp     Rsvp   @default(invited)
  joinedAt DateTime @default(now()) @map("joined_at")
  @@unique([eventId, userId])
  @@index([userId])
  @@map("event_participants")
}

model InviteLink {
  id        String    @id @default(uuid())
  scope     InviteScope
  targetId  String    @map("target_id")
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime? @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdBy String    @map("created_by")
  createdAt DateTime  @default(now()) @map("created_at")
  @@map("invite_links")
}

model Invitation {
  id            String   @id @default(uuid())
  scope         InviteScope
  targetId      String   @map("target_id")
  invitedUserId String?  @map("invited_user_id")
  invitedEmail  String?  @map("invited_email")
  status        InvitationStatus @default(pending)
  invitedBy     String   @map("invited_by")
  createdAt     DateTime @default(now()) @map("created_at")
  @@index([invitedUserId])
  @@index([invitedEmail])
  @@map("invitations")
}
```

Ajouter à `model User` les relations inverses :
`createdEvents EventParticipant[]` — non : `createdEvents Event[] @relation("EventCreator")`
et `eventParticipations EventParticipant[]`.

- [ ] **Étape 1 — test qui échoue.** `api/tests/schema-m1.test.ts`, en base réelle :
  - créer un `User`, un `Event`, un `EventParticipant` ; relire l'événement avec ses
    participants ;
  - un second `EventParticipant` pour le même `(eventId, userId)` est rejeté (contrainte
    `@@unique`) ;
  - `prisma.inviteLink.create` avec un `tokenHash` déjà pris est rejeté ;
  - `prisma.invitation.create` sans `invitedUserId` **ni** `invitedEmail` est rejeté par la
    base (`CHECK`).

  Lancer : `npm test --workspace api -- schema-m1`. Attendu : ÉCHEC — modèles absents.

- [ ] **Étape 2 — écrire les modèles**, puis générer la migration :
  `npm run db:migrate --workspace api -- --name m1_events`.

- [ ] **Étape 3 — ajouter le `CHECK` à la main.** Prisma ne modélise pas les contraintes
  `CHECK`. Éditer la migration générée pour ajouter, après la création de `invitations` :

  ```sql
  ALTER TABLE "invitations"
    ADD CONSTRAINT "invitations_target_identity_check"
    CHECK ("invited_user_id" IS NOT NULL OR "invited_email" IS NOT NULL);
  ```

  Réappliquer : `npm run db:migrate --workspace api` (la migration est ré-exécutée si son
  hachage a changé et qu'elle n'est pas encore marquée appliquée ; sinon
  `prisma migrate reset` en développement puis re-migrer).

- [ ] **Étape 4 — étendre `resetDatabase`.** Dans `api/tests/helpers/db.ts`, `TABLES`
  devient :
  `['invitations', 'invite_links', 'event_participants', 'events', 'session', 'account', 'verification', 'user']`.
  `CASCADE` rend l'ordre indifférent, mais la liste explicite doit rester à jour — un oubli
  se voit.

- [ ] **Étape 5 — vérifier.** `npm test --workspace api` : tout vert, `schema-m1` compris.
  `npx prisma validate --schema api/prisma/schema.prisma` passe.

- [ ] **Étape 6 — commiter.** Inclure le client généré ? Non (non versionné).
  `git add api/prisma/schema.prisma api/prisma/migrations api/tests/helpers/db.ts api/tests/schema-m1.test.ts`
  `git commit -S -m "feat(api): add the event, participant and invitation models"`

---

## Tâche 5 : assistant de session pour les tests

Les routes de M1 exigent une session. Les tests d'intégration ont besoin d'obtenir un cookie
de session sans dépendre d'un chemin d'API supposé.

**Fichiers :** créer `api/tests/helpers/auth.ts`.

**Interface produite :**
- `signIn(email: string): Promise<Headers>` — mène le tour complet lien magique via
  `auth.handler` (Better Auth crée le compte au passage, comme le vérifie `auth.test.ts` de
  M0), extrait le `Set-Cookie` de la réponse de vérification, renvoie des `Headers` prêtes à
  être passées à `app.request()`.

- [ ] **Étape 1 — écrire l'assistant.** Réutiliser la technique de `auth.test.ts` : espionner
  `console.info`, poster sur `/api/auth/sign-in/magic-link`, extraire l'URL du lien
  journalisé, appeler `auth.handler(new Request(url))`, lire `response.headers.get('set-cookie')`,
  n'en garder que la paire `nom=valeur` avant le premier `;`.

- [ ] **Étape 2 — test de l'assistant.** `api/tests/helpers/auth.test.ts` (ou une assertion
  dans un test existant) : `app.request('/api/me', { headers: await signIn('probe@example.test') })`
  répond 200 et le corps porte `user.email === 'probe@example.test'`.

  Lancer : `npm test --workspace api -- auth`. Attendu : PASSE.

- [ ] **Étape 3 — commiter.**
  `git commit -S -m "test(api): sign in a user for integration tests"`

---

## Tâche 6 : créer et lire un événement

**Fichiers :** créer `api/src/modules/events/schema.ts`, `.../service.ts`, `.../routes.ts`,
`api/tests/modules/events.test.ts` ; modifier `api/src/main.ts`.

**Règles (conception §2.5, §3.2) :**
- `POST /api/events` — corps `{ title, description?, startsAt, endsAt }`. `startsAt` et
  `endsAt` sont des chaînes ISO 8601 ; `endsAt` doit être strictement postérieur à
  `startsAt` (zod `refine`, code `invalid_period`). L'événement naît en `draft`. Le créateur
  devient `EventParticipant` `role = admin`, `rsvp = accepted`. Réponse 201
  `{ id }` (ou l'événement complet).
- `GET /api/events` — événements où l'appelant est participant, triés par `startsAt`
  croissant. Réponse `{ events: [{ id, title, startsAt, endsAt, status, role, rsvp }] }`.
- `GET /api/events/:id` — 404 `event_not_found` si l'événement n'existe pas ; **403
  `not_a_participant`** si l'appelant n'est pas participant (ne pas révéler l'existence par
  un message différent au-delà du code). Réponse : l'événement + `participants: [{ userId,
  name, email, role, rsvp, joinedAt }]` + `viewer: { role, rsvp }`.

- [ ] **Étape 1 — schémas zod.** `createEventSchema`, `updateEventSchema` (tâche 7),
  `rsvpSchema` (tâche 7), `inviteSchema` (tâche 8). Un fichier, exportés pour un futur usage
  côté front (conception §5.1 : « importés tels quels par les formulaires »).

- [ ] **Étape 2 — tests qui échouent.** `api/tests/modules/events.test.ts` :
  - `POST /api/events` sans session → 401 ;
  - avec session, corps valide → 201 ; en base, l'événement existe en `draft` et le créateur
    est participant `admin` / `accepted` ;
  - `endsAt` antérieur à `startsAt` → 400 `invalid_period` ;
  - `GET /api/events` ne renvoie que les événements de l'appelant (créer un événement avec
    Alice, un autre avec Bob, vérifier que la liste d'Alice n'a que le sien) ;
  - `GET /api/events/:id` par un non-participant → 403 `not_a_participant` ;
  - `GET /api/events/:id` inexistant → 404 `event_not_found` ;
  - `GET /api/events/:id` par le créateur → 200 avec la liste des participants.

  Lancer : `npm test --workspace api -- events`. Attendu : ÉCHEC.

- [ ] **Étape 3 — service puis routes.** `service.ts` ne connaît pas Hono (fonctions pures
  d'entrées/sorties Prisma, reçoivent `userId` en argument). `routes.ts` :
  `new Hono().post('/', zValidator('json', createEventSchema), ...).get('/', ...).get('/:id', ...)`
  — chaînage indispensable pour l'inférence de `AppType`.

- [ ] **Étape 4 — monter.** Dans `main.ts` : `.route('/api/events', eventsRoutes)` avant
  `.onError(...)`. `requireSession` s'applique par `eventsRoutes.use('*', requireSession)` en
  tête du sous-routeur.

- [ ] **Étape 5 — vérifier, commiter.**
  `git commit -S -m "feat(api): create events and read them with their participants"`

---

## Tâche 7 : modifier un événement, répondre à l'invitation

**Fichiers :** modifier `.../service.ts`, `.../routes.ts`, `api/tests/modules/events.test.ts`.

**Règles (conception §3.1, §3.2, §3.8) :**
- `PATCH /api/events/:id` — **administrateur uniquement** (`canManageEvent`), sinon 403
  `forbidden`. Corps partiel `{ title?, description?, startsAt?, endsAt?, status? }`. Si
  `startsAt`/`endsAt` sont touchés, l'invariant `endsAt > startsAt` est revérifié sur les
  valeurs résultantes. `status` accepte n'importe quelle valeur de `EventStatus` depuis
  n'importe quel état — **aucun état absorbant** (§3.1). Réponse : l'événement à jour.
- `POST /api/events/:id/rsvp` — corps `{ rsvp: 'accepted' | 'declined' }`. Met à jour la
  ligne `EventParticipant` de l'appelant. 403 `not_a_participant` si l'appelant n'a pas de
  ligne. Un participant qui décline **conserve sa ligne** (§3.2) : on ne supprime jamais.

- [ ] **Étape 1 — tests qui échouent :**
  - `PATCH` par un participant `member` → 403 `forbidden` ;
  - `PATCH` par l'admin, `{ title }` → 200, titre changé ;
  - `PATCH` `{ startsAt }` qui rendrait `endsAt <= startsAt` → 400 `invalid_period` ;
  - `PATCH` `{ status: 'closed' }` puis `{ status: 'draft' }` → les deux réussissent (retour
    arrière autorisé) ;
  - `POST /rsvp` `{ rsvp: 'declined' }` par un participant → 200, sa ligne passe à
    `declined`, la ligne existe toujours ;
  - `POST /rsvp` par un non-participant → 403 `not_a_participant`.

  Lancer : `npm test --workspace api -- events`. Attendu : ÉCHEC sur les nouveaux cas.

- [ ] **Étape 2 — implémenter, vérifier, commiter.**
  `git commit -S -m "feat(api): edit an event and record RSVP replies"`

---

## Tâche 8 : émettre une invitation

**Fichiers :** modifier `.../schema.ts`, `.../service.ts`, `.../routes.ts` ;
`api/tests/modules/events.test.ts`.

**Règles (conception §2.6, §4) :**
- `POST /api/events/:id/invitations` — **administrateur uniquement**. Corps, l'un ou
  l'autre :
  - `{ kind: 'link', expiresInHours?: number }` → créer un `InviteLink` (`scope = 'event'`,
    `targetId = eventId`, `tokenHash = hashInviteToken(raw)`, `expiresAt` calculé ou nul).
    Réponse `{ url: "<APP_URL>/invite/<raw>" }`. Le jeton brut n'est renvoyé qu'ici, jamais
    relu.
  - `{ kind: 'email', email: string }` → créer une `Invitation`. **Anti-énumération :** si
    un `User` a cette adresse (correspondance stricte, jamais partielle), renseigner
    `invitedUserId` ; sinon renseigner `invitedEmail`. Dans **les deux cas**, réponse
    identique `{ status: 'sent' }` avec le même code HTTP, et envoi d'un courriel en tâche de
    fond (`void mailer.send(...).catch(...)`) contenant `<APP_URL>/invite/<invitationId>`.

- [ ] **Étape 1 — tests qui échouent :**
  - `POST /invitations` par un `member` → 403 ;
  - `{ kind: 'link' }` par l'admin → 200, corps `{ url }` où `url` finit par `/invite/<t>` ;
    en base un `InviteLink` existe, et `tokenHash === hashInviteToken(t)`, `expiresAt` nul ;
  - `{ kind: 'link', expiresInHours: 48 }` → `expiresAt` ≈ maintenant + 48 h (tolérance
    large) ;
  - `{ kind: 'email', email }` pour une adresse **connue** et pour une adresse **inconnue** :
    `response.status` identiques, corps identiques ; en base, la première invitation porte
    `invitedUserId`, la seconde `invitedEmail` ;
  - un courriel est journalisé (repli console) contenant `/invite/` — assertion souple, via
    espion sur `console.info`.

  Lancer : `npm test --workspace api -- events`. Attendu : ÉCHEC.

- [ ] **Étape 2 — implémenter.** `service.ts` reçoit le `mailer` en argument (ou l'importe ;
  trancher — l'injecter facilite le test, cf. journal M0 sur la résolution tardive du
  mailer). L'`APP_URL` vient de `config.appUrl`.

- [ ] **Étape 3 — vérifier, commiter.**
  `git commit -S -m "feat(api): issue shareable and e-mail invitations"`

---

## Tâche 9 : accepter une invitation

**Fichiers :** créer `api/src/modules/invitations/service.ts`, `.../routes.ts`,
`api/tests/modules/invitations.test.ts` ; modifier `api/src/main.ts`.

**Règles (conception §2.6, §3.2) :**
- `POST /api/invitations/:token/accept` — session requise. Résolution :
  1. `InviteLink` où `tokenHash === hashInviteToken(token)`, `revokedAt` nul, `expiresAt`
     nul ou futur → l'appelant devient `EventParticipant` (`role = member`, `rsvp =
     invited`) s'il ne l'est pas déjà. **Idempotent** : déjà participant → 200
     `{ eventId }`.
  2. sinon `Invitation` où `id === token`, `status === 'pending'` → vérifier l'identité :
     `invitedUserId === user.id` **ou** `invitedEmail === user.email` (strict). Sinon 403
     `invitation_not_yours`. Créer la ligne participant, passer l'invitation à `accepted`.
  3. sinon 404 `invitation_not_found`. Un lien révoqué, expiré ou déjà consommé tombe ici ou
     en 410 `invitation_link_expired` / `invitation_link_revoked` — trancher, tester le code
     retenu.

- [ ] **Étape 1 — tests qui échouent :**
  - accepter sans session → 401 ;
  - jeton de lien valide → 200 `{ eventId }` ; en base, l'appelant est participant `member` /
    `invited` ;
  - même appel une seconde fois → 200, toujours une seule ligne participant ;
  - jeton de lien révoqué (`revokedAt` posé) → code d'échec retenu, pas de participant ;
  - jeton de lien expiré (`expiresAt` passé) → idem ;
  - invitation nominative acceptée par le bon utilisateur → 200, invitation `accepted` ;
  - invitation nominative, autre utilisateur → 403 `invitation_not_yours`, invitation encore
    `pending` ;
  - jeton inconnu → 404 `invitation_not_found`.

  Lancer : `npm test --workspace api -- invitations`. Attendu : ÉCHEC.

- [ ] **Étape 2 — implémenter.** Monter `.route('/api/invitations', invitationsRoutes)` dans
  `main.ts`, `requireSession` en tête du sous-routeur.

- [ ] **Étape 3 — vérifier la séquence complète de la CI en local :**
  `npm ci && npm run db:generate && npx prisma migrate deploy --config api/prisma.config.ts --schema api/prisma/schema.prisma && npx biome ci . && npm run typecheck && npm test && npm run build`.

- [ ] **Étape 4 — commiter.**
  `git commit -S -m "feat(api): accept an invitation and join the event"`

---

## Tâche 10 : tableau de bord et création côté front

**Fichiers :** modifier `web/src/router.ts`, `web/src/views/HomeView.vue` ; créer
`web/src/views/EventCreateView.vue`, `web/src/composables/useEvents.ts` ;
`web/tests/events.test.ts`.

- [ ] **Étape 1 — test qui échoue.** `web/tests/events.test.ts` : un composable
  `useEvents()` qui appelle `/api/events` et expose `state: 'loading' | 'empty' | 'error' |
  'ready'` et `events`. `fetch` bouchonné renvoyant `{ events: [] }` → `state === 'empty'` ;
  renvoyant une liste → `state === 'ready'` ; rejet réseau → `state === 'error'`.

  Lancer : `npm test --workspace web`. Attendu : ÉCHEC.

- [ ] **Étape 2 — implémenter le composable** puis les vues. `HomeView` traite les quatre
  états (conception §6.6). `EventCreateView` : formulaire `title`, `description`, `startsAt`,
  `endsAt` (`<input type="datetime-local">`), POST via le client `api`, redirection
  `router.push('/events/' + id)`. Erreur `invalid_period` affichée sous le champ de fin.

- [ ] **Étape 3 — routes.** `web/src/router.ts` : `{ path: '/events/new', name: 'event-new',
  component: EventCreateView, meta: { requiresAuth: true } }` et
  `{ path: '/events/:id', name: 'event', component: EventView, meta: { requiresAuth: true } }`
  et `{ path: '/invite/:token', name: 'invite', component: InviteAcceptView }` (pas de
  `requiresAuth` : la vue gère elle-même la redirection).

- [ ] **Étape 4 — vérifier** (`npm run typecheck` lance `vue-tsc`), **commiter.**
  `git commit -S -m "feat(web): list events on the dashboard and create one"`

---

## Tâche 11 : vue d'un événement et RSVP

**Fichiers :** créer `web/src/views/EventView.vue`, `web/src/composables/useEvent.ts` ;
`web/tests/event.test.ts` ; modifier `web/src/router.ts` si non fait.

- [ ] **Étape 1 — test qui échoue.** `useEvent(id)` charge `/api/events/:id`, expose les
  quatre états, `event`, `participants`, `viewer`, et les actions `setRsvp(value)`,
  `refresh()`. `fetch` bouchonné : 200 → `state === 'ready'` ; 403 → `state === 'error'`
  avec un message « Vous ne participez pas à cet événement. » ; `setRsvp` POST puis
  `refresh`.

- [ ] **Étape 2 — implémenter.** `EventView` : titre, dates lisibles (fr), statut ; liste des
  participants avec pastille de rôle et de RSVP ; pour l'appelant, deux boutons
  « Je participe » / « Je ne peux pas », l'actuel mis en évidence. Pour un `admin` :
  section « Inviter » (tâche 12) et section « Modifier » (titre, dates, statut) appelant
  `PATCH`. Barre d'onglets **Participants** actif, **Programme** et **Dépenses** désactivés
  avec l'intitulé « à venir » (conception §6.1). Composable détruit à la navigation
  (conception §6.2).

- [ ] **Étape 3 — vérifier, commiter.**
  `git commit -S -m "feat(web): show an event and let a participant reply"`

---

## Tâche 12 : panneau d'invitation et acceptation côté front

**Fichiers :** modifier `web/src/views/EventView.vue`, `web/src/views/LoginView.vue`,
`web/src/router.ts` ; créer `web/src/views/InviteAcceptView.vue` ; `web/tests/invite.test.ts`.

- [ ] **Étape 1 — test qui échoue.** Un composable ou la logique de `InviteAcceptView` :
  monté avec un `token`, si la session est `anonymous`, il enregistre le chemin cible et
  redirige vers `/login?redirect=/invite/<token>` ; si `authenticated`, il POST
  `/api/invitations/<token>/accept` et redirige vers `/events/<eventId>` ; sur 404, il
  affiche « Cette invitation n'est plus valide. »

- [ ] **Étape 2 — implémenter.**
  - `LoginView` : lire `route.query.redirect` (chaîne, défaut `/`), le passer à
    `requestMagicLink` qui le transmet en `callbackURL`. `session.ts#requestMagicLink` prend
    un second argument `callbackURL = '/'`.
  - `InviteAcceptView` : `onMounted`, s'assurer que la session est résolue
    (`session.fetchSession()` si `unknown`), puis appliquer la logique ci-dessus. Quatre
    états d'interface.
  - `EventView` panneau « Inviter » (admin) : bouton « Créer un lien » → POST
    `{ kind: 'link' }` → afficher l'URL renvoyée avec un bouton « Copier »
    (`navigator.clipboard`). Champ « Inviter par e-mail » → POST `{ kind: 'email', email }` →
    message de confirmation **identique quelle que soit l'adresse** (« Si un compte existe,
    l'invitation part ; sinon un courriel d'invitation est envoyé. »).

- [ ] **Étape 3 — parcours de bout en bout.** `npm run db:up && npm run db:seed && npm run dev`.
  Se connecter en Alice, créer un événement, créer un lien, le copier. Fenêtre privée :
  ouvrir le lien, se connecter en Bob (lien magique dans la console), constater la
  redirection vers l'événement, cliquer « Je participe ». Revenir en Alice, rafraîchir :
  Bob apparaît, `accepted`. **Vérifier à 375 px de large.**

- [ ] **Étape 4 — vérifier, commiter.**
  `git commit -S -m "feat(web): invite from an event and consume an invitation link"`

---

## Tâche 13 : documentation et journal

**Fichiers :** modifier `docs/conception.md` (§5.1 : ajouter `GET /api/events`),
`docs/journal-decisions.md` (les cinq décisions ci-dessus), `docs/workflow.md` et
`README.md` (marquer M1 en cours / fait), `CLAUDE.md` (section « État actuel »).

- [ ] **Étape 1 — corriger `conception.md` §5.1.** Ajouter `GET /events` à la liste, en
  précisant « événements de l'appelant, triés par date ».

- [ ] **Étape 2 — journal.** Ajouter une section « M1 » avec les cinq décisions, chacune
  avec son motif et son coût si erroné.

- [ ] **Étape 3 — `CLAUDE.md`.** Section « État actuel » : M1 terminé (ou en cours), M2
  suivant. Ajouter aux « Pièges connus » : `resetDatabase` liste les tables à la main,
  chaque jalon l'étend.

- [ ] **Étape 4 — `README.md`.** Ajouter au parcours « Se connecter » un paragraphe
  « Créer et partager un événement ».

- [ ] **Étape 5 — commiter.**
  `git commit -S -m "docs: record the M1 API addition and the five milestone decisions"`

---

## Tâche 14 : CI

**Fichiers :** `.github/workflows/ci.yml`.

- [ ] La CI applique déjà `prisma migrate deploy` (ajouté en M0). Vérifier qu'aucune variable
  nouvelle n'est requise : M1 n'introduit pas de variable d'environnement (l'`APP_URL`
  existe déjà). Rien à changer, sauf si un test l'exige — dans ce cas, ajouter la variable au
  bloc `env` **et** à `.env.example`.

- [ ] **Étape finale — ouvrir la branche.** Ne **pas** ouvrir de pull request sans demande
  explicite. Pousser la branche `feat/m1` et s'arrêter là.

---

## Critère d'achèvement de M1

- [ ] `npm ci && npm run db:generate && npx prisma migrate deploy --config api/prisma.config.ts --schema api/prisma/schema.prisma && npx biome ci . && npm run typecheck && npm test && npm run build` passe.
- [ ] Un utilisateur crée un événement, en fixe la date, génère un lien.
- [ ] Un tiers ouvre le lien, s'authentifie, rejoint l'événement, répond ; le créateur le voit.
- [ ] Une invitation par adresse connue et par adresse inconnue produisent la même réponse.
- [ ] Aucun état d'événement n'est absorbant : `closed → draft` fonctionne.
- [ ] Les vues traitent les quatre états d'interface ; utilisables à 375 px.
- [ ] **Reste dû, hors code :** déploiement sur une URL publique HTTPS (livrable §9).
