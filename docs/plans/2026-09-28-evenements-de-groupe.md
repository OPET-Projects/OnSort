# Événements de groupe — plan d'implémentation

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** un événement peut naître dans un groupe ; ses membres y sont invités d'office, et
ceux qui arrivent ensuite sont ajoutés aux événements pas encore commencés.

**Architecture :** participations **matérialisées** à l'écriture. Deux points d'écriture —
`createEvent` et `joinGroup` — partagent un petit module `groups/enrollment.ts` qui verrouille
la ligne du groupe et inscrit. Les lectures existantes (`GET /groups/:id`, `GET /events`,
`GET /events/:id`) gagnent chacune un champ. Côté web, un module pur construit et lit le
lien de création pré-rempli.

**Pile :** Hono, Prisma 7 (adaptateur `pg`), Zod 4, Vue 3, vue-router 5, Vitest.

**Spec :** [`2026-09-28-evenements-de-groupe-conception.md`](2026-09-28-evenements-de-groupe-conception.md).
**Conception :** [`../conception.md`](../conception.md) §2.5, §5.1, §5.2. **Fait autorité.**

## Contraintes globales

- Branche `feat/group-events`, tirée de `feature`. Fusion dans `feature`, **jamais** dans `main`.
- Aucune dépendance nouvelle, aucune montée de version.
- **Une migration** : `20260928000000_group_events`, écrite à la main — un agent ne peut pas
  lancer `prisma migrate dev`. Appliquer depuis `api/` : `npx prisma migrate deploy` puis
  `npm run db:generate`, vérifier par `npx prisma migrate status`.
- Identifiants et commits en anglais ; messages d'erreur, commentaires et interface en français.
- Commits Conventional Commits, corps sur le *pourquoi*, **aucune ligne d'attribution**.
- Portes avant **chaque** commit, **chacune seule**, jamais à travers un tube :
  `npx biome check --write .`, `npm run typecheck`, `npm test`.
- **Ne jamais appliquer la correction automatique de Biome à un `.vue`.** Si
  `biome check --write` touche un `.vue`, annuler ce fichier (`git checkout -- <fichier>`).
- Intervalles semi-ouverts ; « pas encore commencé » s'écrit `startsAt > maintenant`.

## Review Focus

- **Création et arrivée simultanées** : le nouveau membre doit finir inscrit. Couvert par le
  test de course de la tâche 3.
- **Membre déjà participant à titre individuel** avant de rejoindre le groupe : son rôle
  (peut-être `admin`) et sa réponse ne doivent pas bouger. Tâche 3, test « participant
  existant inchangé ».
- **Groupe à un seul membre** : créer un événement ne doit ni échouer ni notifier personne.
  Tâche 2.
- **Rejoindre un groupe sans événement futur** : aucune notification, aucun message de flux.
  Tâche 3.
- **`?group=` pointant vers un groupe dont on n'est pas membre** (lien copié) : le formulaire
  ne doit pas proposer un groupe fantôme ; le 403 de l'API s'affiche comme message. Tâche 6.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `api/prisma/schema.prisma` | Relation `Event.group` / `Group.events` |
| `api/prisma/migrations/20260928000000_group_events/migration.sql` | Clé étrangère |
| `api/src/modules/groups/enrollment.ts` *(nouveau)* | `lockGroup`, `enrollInUpcomingEvents` |
| `api/src/modules/events/schema.ts` | `groupId` facultatif |
| `api/src/modules/events/service.ts` | `createEvent` en groupe, `getEvent.group`, `listEvents.groupName` |
| `api/src/modules/invitations/service.ts` | `joinGroup` inscrit aux événements à venir |
| `api/src/modules/groups/service.ts` | `getGroup.events` |
| `api/tests/schema-group-events.test.ts` *(nouveau)* | Clé étrangère |
| `api/tests/modules/group-events.test.ts` *(nouveau)* | Règles métier et lectures |
| `web/src/lib/dates.ts` | `isoToLocalInput` |
| `web/src/lib/event-draft.ts` *(nouveau)* | Lien pré-rempli : construction et lecture |
| `web/tests/event-draft.test.ts` *(nouveau)* | Tests du module ci-dessus |
| `web/src/composables/useGroup.ts`, `useEvent.ts`, `useEvents.ts`, `useEventStream.ts` | Types et flux |
| `web/src/views/EventCreateView.vue`, `GroupView.vue`, `EventView.vue`, `HomeView.vue` | Interface |
| `web/src/components/FreeSlots.vue` | Créneau cliquable |
| `docs/conception.md`, `docs/journal-decisions.md`, `CLAUDE.md` | Documentation |

---

### Tâche 1 : clé étrangère `events.group_id`

**Fichiers :**
- Modifier : `api/prisma/schema.prisma` (modèles `Event`, `Group`)
- Créer : `api/prisma/migrations/20260928000000_group_events/migration.sql`
- Tester : `api/tests/schema-group-events.test.ts`

**Interfaces :**
- Produit : `prisma.event` porte la relation `group` (`Group | null`) ; `prisma.group` porte `events`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// api/tests/schema-group-events.test.ts
import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeUser(email: string) {
  return prisma.user.create({ data: { id: `u-${email}`, name: email, email } })
}

const period = {
  startsAt: new Date('2026-10-01T18:00:00Z'),
  endsAt: new Date('2026-10-01T22:00:00Z'),
}

it('refuse un événement rattaché à un groupe inexistant', async () => {
  const alice = await makeUser('alice@example.test')

  await expect(
    prisma.event.create({
      data: {
        title: 'Sortie',
        ...period,
        createdBy: alice.id,
        groupId: '00000000-0000-4000-8000-000000000000',
      },
    }),
  ).rejects.toThrow()
})

// Un groupe supprimé ne doit pas emporter ses sorties : leurs dépenses sont de l'argent réel.
it("détache les événements d'un groupe supprimé au lieu de les supprimer", async () => {
  const alice = await makeUser('alice@example.test')
  const group = await prisma.group.create({ data: { name: 'G', createdBy: alice.id } })
  const event = await prisma.event.create({
    data: { title: 'Sortie', ...period, createdBy: alice.id, groupId: group.id },
  })

  await prisma.group.delete({ where: { id: group.id } })

  const reread = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
  expect(reread.groupId).toBeNull()
})

it('relie un événement à son groupe', async () => {
  const alice = await makeUser('alice@example.test')
  const group = await prisma.group.create({ data: { name: 'G', createdBy: alice.id } })
  await prisma.event.create({
    data: { title: 'Sortie', ...period, createdBy: alice.id, groupId: group.id },
  })

  const reread = await prisma.group.findUniqueOrThrow({
    where: { id: group.id },
    include: { events: true },
  })
  expect(reread.events).toHaveLength(1)
})
```

- [ ] **Étape 2 : le voir échouer**

Lancer : `npm test --workspace api -- schema-group-events`
Attendu : ÉCHEC — le premier test ne lève pas (aucune clé étrangère), le troisième ne compile
pas au typage (`events` inconnu) et échoue à l'exécution.

- [ ] **Étape 3 : schéma**

Dans `model Event`, sous `groupId` :

```prisma
  group        Group?             @relation(fields: [groupId], references: [id], onDelete: SetNull)
```

Dans `model Group`, sous `members` :

```prisma
  events    Event[]
```

- [ ] **Étape 4 : migration écrite à la main**

```sql
-- api/prisma/migrations/20260928000000_group_events/migration.sql
-- Événements de groupe : la colonne `group_id` existe depuis M1, sans clé étrangère faute
-- d'usage. `SET NULL` plutôt que `CASCADE` : un groupe qui disparaît ne doit pas emporter
-- ses sorties, dont les dépenses sont de l'argent réel. L'événement survit en ad hoc.
-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Étape 5 : appliquer et régénérer, depuis `api/`**

```sh
cd api && npx prisma migrate deploy && npm run db:generate && npx prisma migrate status
```

Attendu : « Database schema is up to date! »

- [ ] **Étape 6 : le voir passer**

Lancer : `npm test --workspace api -- schema-group-events`
Attendu : 3 tests PASS.

- [ ] **Étape 7 : portes puis commit**

```sh
git add api/prisma api/tests/schema-group-events.test.ts
git commit -m "feat(api): tie events to their group with a foreign key

The column has existed since M1 without a constraint because nothing used
it. SET NULL keeps an event and its expenses alive if its group goes away."
```

---

### Tâche 2 : créer un événement dans un groupe

**Fichiers :**
- Créer : `api/src/modules/groups/enrollment.ts`
- Modifier : `api/src/modules/events/schema.ts`, `api/src/modules/events/service.ts` (`createEvent`)
- Tester : `api/tests/modules/group-events.test.ts`

**Interfaces :**
- Consomme : relation `Event.group` (tâche 1).
- Produit :
  - `lockGroup(tx: Prisma.TransactionClient, groupId: string): Promise<boolean>` — `false` si le groupe n'existe pas.
  - `enrollInUpcomingEvents(tx: Prisma.TransactionClient, groupId: string, userId: string): Promise<{ participantId: string; eventId: string; title: string }[]>` — rend **seulement** les participations créées.
  - `CreateEventInput.groupId?: string`.
  - Helpers de test dans `group-events.test.ts` : `send`, `userId`, `makeGroup`, `addMember`, `makeEvent`.

- [ ] **Étape 1 : module d'inscription**

`enrollInUpcomingEvents` sert la tâche 3 ; il est posé ici avec `lockGroup` parce que les deux
partagent le même contrat de verrou.

```ts
// api/src/modules/groups/enrollment.ts
import type { Prisma } from '../../generated/prisma/client.ts'

// Inscription d'office des membres d'un groupe à ses événements (spec « événements de
// groupe »). Deux écritures se croisent ici : créer un événement dans un groupe, et entrer
// dans un groupe. Chacune lit ce que l'autre écrit ; sans ordre imposé, une création et une
// arrivée simultanées s'ignoreraient mutuellement et le nouveau membre resterait dehors.
//
// Le verrou de ligne sur `groups` impose cet ordre : la seconde transaction attend la
// première, et ses lectures — des instructions nouvelles, en READ COMMITTED — la voient.

export async function lockGroup(tx: Prisma.TransactionClient, groupId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE
  `
  return rows.length > 0
}

// Inscrit `userId` aux événements du groupe **pas encore commencés**. Un participant
// existant — invité à titre individuel avant d'entrer dans le groupe, voire administrateur —
// garde son rôle et sa réponse : `skipDuplicates` s'appuie sur l'unicité `(event_id,
// user_id)`, et seules les lignes réellement créées reviennent.
export async function enrollInUpcomingEvents(
  tx: Prisma.TransactionClient,
  groupId: string,
  userId: string,
) {
  const upcoming = await tx.event.findMany({
    where: { groupId, startsAt: { gt: new Date() } },
    select: { id: true, title: true },
  })

  if (upcoming.length === 0) {
    return []
  }

  const created = await tx.eventParticipant.createManyAndReturn({
    data: upcoming.map((event) => ({
      eventId: event.id,
      userId,
      role: 'member' as const,
      rsvp: 'invited' as const,
    })),
    skipDuplicates: true,
    select: { id: true, eventId: true },
  })

  const titleOf = new Map(upcoming.map((event) => [event.id, event.title]))

  return created.map((row) => ({
    participantId: row.id,
    eventId: row.eventId,
    title: titleOf.get(row.eventId) ?? '',
  }))
}
```

- [ ] **Étape 2 : écrire les tests qui échouent**

```ts
// api/tests/modules/group-events.test.ts
import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

async function send(method: string, path: string, headers: Headers, body?: unknown) {
  return app.request(path, {
    method,
    headers: new Headers([...headers, ['content-type', 'application/json']]),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function userId(headers: Headers): Promise<string> {
  const me = await app.request('/api/me', { headers })
  return ((await me.json()) as { user: { id: string } }).user.id
}

async function makeGroup(headers: Headers): Promise<string> {
  const response = await send('POST', '/api/groups', headers, { name: 'Les copains' })
  return ((await response.json()) as { id: string }).id
}

// Insertion directe : ces tests portent sur les événements, pas sur l'invitation au groupe.
async function addMember(groupId: string, headers: Headers): Promise<void> {
  await prisma.groupMember.create({ data: { groupId, userId: await userId(headers) } })
}

const DAY = 86_400_000

async function makeEvent(headers: Headers, groupId?: string, startsInDays = 7) {
  const startsAt = new Date(Date.now() + startsInDays * DAY)
  return send('POST', '/api/events', headers, {
    title: 'Raclette',
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 4 * 3_600_000).toISOString(),
    groupId,
  })
}

async function eventIdOf(response: Response): Promise<string> {
  return ((await response.json()) as { id: string }).id
}

it('invite d’office les autres membres du groupe', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  await addMember(groupId, carla)

  const response = await makeEvent(bob, groupId)
  expect(response.status).toBe(201)
  const eventId = await eventIdOf(response)

  const rows = await prisma.eventParticipant.findMany({ where: { eventId } })
  const byUser = new Map(rows.map((row) => [row.userId, row]))

  expect(rows).toHaveLength(3)
  expect(byUser.get(await userId(bob))).toMatchObject({ role: 'admin', rsvp: 'accepted' })
  expect(byUser.get(await userId(alice))).toMatchObject({ role: 'member', rsvp: 'invited' })
  expect(byUser.get(await userId(carla))).toMatchObject({ role: 'member', rsvp: 'invited' })

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  expect(event.groupId).toBe(groupId)
})

it('notifie les membres invités, pas le créateur', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)

  const eventId = await eventIdOf(await makeEvent(alice, groupId))

  const notifications = await prisma.notification.findMany({ where: { type: 'event.invited' } })
  expect(notifications.map((n) => n.userId)).toEqual([await userId(bob)])
  expect(notifications[0]?.eventId).toBe(eventId)
})

it('crée sans erreur dans un groupe dont on est le seul membre', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await makeEvent(alice, groupId)

  expect(response.status).toBe(201)
  expect(await prisma.notification.count()).toBe(0)
})

it('refuse la création à un non-membre du groupe', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)

  const response = await makeEvent(bob, groupId)

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'not_a_member' })
  expect(await prisma.event.count()).toBe(0)
})

it('rend 404 sur un groupe inconnu', async () => {
  const alice = await signIn('alice@example.test')

  const response = await makeEvent(alice, '00000000-0000-4000-8000-000000000000')

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'group_not_found' })
  expect(await prisma.event.count()).toBe(0)
})

it('refuse un identifiant de groupe mal formé', async () => {
  const alice = await signIn('alice@example.test')

  const response = await makeEvent(alice, 'pas-un-uuid')

  expect(response.status).toBe(400)
})

it('laisse une sortie sans groupe inchangée', async () => {
  const alice = await signIn('alice@example.test')

  const eventId = await eventIdOf(await makeEvent(alice))

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  expect(event.groupId).toBeNull()
  expect(await prisma.eventParticipant.count({ where: { eventId } })).toBe(1)
})
```

- [ ] **Étape 3 : les voir échouer**

Lancer : `npm test --workspace api -- group-events`
Attendu : ÉCHEC — `groupId` est ignoré par Zod (`z.object` retire les clés inconnues), les
événements naissent sans groupe ni invités ; les tests 403/404/400 reçoivent 201.

- [ ] **Étape 4 : schéma de requête**

Dans `createEventSchema` (`api/src/modules/events/schema.ts`) :

```ts
  // Facultatif : absent, la sortie est ad hoc (conception §2.5).
  groupId: z.uuid().optional(),
```

- [ ] **Étape 5 : `createEvent`**

Remplacer `createEvent` dans `api/src/modules/events/service.ts`, et ajouter l'import
`import { lockGroup } from '../groups/enrollment.ts'` :

```ts
export async function createEvent(userId: string, input: CreateEventInput) {
  assertPeriod(input.startsAt, input.endsAt)

  const fields = {
    title: input.title,
    description: input.description,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    createdBy: userId,
  }

  // Le créateur est d'emblée administrateur et présent (conception §3.2).
  if (input.groupId === undefined) {
    return prisma.event.create({
      data: { ...fields, participants: { create: { userId, role: 'admin', rsvp: 'accepted' } } },
    })
  }

  const groupId = input.groupId

  // Dans un groupe, chaque autre membre est invité d'office. Le verrou ordonne cette
  // création face à une arrivée simultanée dans le groupe (voir `enrollment.ts`).
  const { event, invitedIds } = await prisma.$transaction(async (tx) => {
    if (!(await lockGroup(tx, groupId))) {
      throw new ApiError('group_not_found', 404, 'Groupe introuvable.')
    }

    const members = await tx.groupMember.findMany({ where: { groupId }, select: { userId: true } })

    if (!members.some((member) => member.userId === userId)) {
      throw new ApiError('not_a_member', 403, 'Vous ne faites pas partie de ce groupe.')
    }

    const others = members.map((member) => member.userId).filter((id) => id !== userId)

    const created = await tx.event.create({
      data: {
        ...fields,
        groupId,
        participants: {
          create: [
            { userId, role: 'admin', rsvp: 'accepted' },
            ...others.map((id) => ({ userId: id, role: 'member' as const, rsvp: 'invited' as const })),
          ],
        },
      },
    })

    return { event: created, invitedIds: others }
  })

  // Hors transaction : une notification qui échoue n'échoue pas l'action (lib/notify.ts).
  await notify({
    userIds: invitedIds,
    type: 'event.invited',
    eventId: event.id,
    payload: { title: event.title },
  })

  return event
}
```

- [ ] **Étape 6 : les voir passer**

Lancer : `npm test --workspace api -- group-events`
Attendu : 7 tests PASS.

- [ ] **Étape 7 : portes puis commit**

```sh
git add api/src/modules/groups/enrollment.ts api/src/modules/events api/tests/modules/group-events.test.ts
git commit -m "feat(api): create an event inside a group and invite its members

Members are invited rather than enrolled as attending: joining the group
was consented to, the outing still has to be. The group row lock orders
this against a concurrent join so neither misses the other."
```

---

### Tâche 3 : un nouvel arrivant rejoint les événements à venir

**Fichiers :**
- Modifier : `api/src/modules/invitations/service.ts` (`joinGroup`)
- Modifier : `web/src/composables/useEventStream.ts` (`PARTICIPANT_TYPES`)
- Tester : `api/tests/modules/group-events.test.ts` (ajouts)

**Interfaces :**
- Consomme : `lockGroup`, `enrollInUpcomingEvents` (tâche 2) ; helpers de test de la tâche 2.
- Produit : message de flux `participant.joined` (`{ type, id: participantId }`).

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à `group-events.test.ts` les imports
`import { acceptInvitation } from '../../src/modules/invitations/service.ts'` et
`import { subscribe } from '../../src/lib/sse.ts'`, puis :

```ts
// Entrée par le chemin réel des trois canaux : une invitation nominative acceptée.
async function join(groupId: string, headers: Headers, email: string) {
  const invitation = await prisma.invitation.create({
    data: { scope: 'group', targetId: groupId, invitedEmail: email, invitedBy: 'unused' },
  })
  await acceptInvitation({ id: await userId(headers), email }, invitation.id)
}

it('ajoute un nouvel arrivant aux événements à venir du groupe', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const upcoming = await eventIdOf(await makeEvent(alice, groupId, 7))

  await join(groupId, bob, 'bob@example.test')

  const row = await prisma.eventParticipant.findUniqueOrThrow({
    where: { eventId_userId: { eventId: upcoming, userId: await userId(bob) } },
  })
  expect(row).toMatchObject({ role: 'member', rsvp: 'invited' })
})

it('ne l’ajoute ni aux événements passés ni à ceux déjà commencés', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const past = await eventIdOf(await makeEvent(alice, groupId, -7))
  // Commencé hier, se termine dans trois jours : un séjour en cours.
  const started = await prisma.event.create({
    data: {
      title: 'Séjour',
      startsAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() + 3 * DAY),
      createdBy: await userId(alice),
      groupId,
    },
  })

  await join(groupId, bob, 'bob@example.test')

  const bobId = await userId(bob)
  expect(await prisma.eventParticipant.count({ where: { userId: bobId, eventId: past } })).toBe(0)
  expect(
    await prisma.eventParticipant.count({ where: { userId: bobId, eventId: started.id } }),
  ).toBe(0)
})

it('laisse intact un participant déjà présent à titre individuel', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))
  await prisma.eventParticipant.create({
    data: { eventId, userId: await userId(bob), role: 'admin', rsvp: 'declined' },
  })

  await join(groupId, bob, 'bob@example.test')

  const row = await prisma.eventParticipant.findUniqueOrThrow({
    where: { eventId_userId: { eventId, userId: await userId(bob) } },
  })
  expect(row).toMatchObject({ role: 'admin', rsvp: 'declined' })
  expect(await prisma.notification.count({ where: { type: 'event.invited' } })).toBe(0)
})

it('est idempotent quand on rejoint deux fois', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))

  await join(groupId, bob, 'bob@example.test')
  await join(groupId, bob, 'bob@example.test')

  expect(await prisma.eventParticipant.count({ where: { eventId } })).toBe(2)
  expect(await prisma.notification.count({ where: { type: 'event.invited' } })).toBe(1)
})

it('notifie le nouvel arrivant et publie sur le flux de chaque événement', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))
  const received: unknown[] = []
  const unsubscribe = subscribe(eventId, (message) => received.push(message))

  try {
    await join(groupId, bob, 'bob@example.test')
  } finally {
    unsubscribe()
  }

  const notification = await prisma.notification.findFirstOrThrow({
    where: { type: 'event.invited' },
  })
  expect(notification).toMatchObject({ userId: await userId(bob), eventId })
  expect(received).toEqual([{ type: 'participant.joined', id: expect.any(String) }])
})

it('ne notifie rien quand le groupe n’a aucun événement à venir', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)

  await join(groupId, bob, 'bob@example.test')

  expect(await prisma.notification.count({ where: { type: 'event.invited' } })).toBe(0)
})

it('laisse intactes les parts d’une dépense antérieure', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))
  const expense = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Fromage',
    amountCents: 3000,
    splitMode: 'equal',
  })
  expect(expense.status).toBe(201)
  const before = await prisma.expenseShare.findMany({ orderBy: { id: 'asc' } })

  await join(groupId, bob, 'bob@example.test')

  expect(await prisma.expenseShare.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
})

// Probabiliste : il peut passer par chance sans le verrou. Vérifié une fois en retirant
// l'appel à `lockGroup` des deux côtés — il échoue alors dans la plupart des exécutions.
it('inscrit toujours le membre quand création et arrivée se croisent', async () => {
  for (let round = 0; round < 5; round += 1) {
    const alice = await signIn(`alice-${round}@example.test`)
    const bob = await signIn(`bob-${round}@example.test`)
    const groupId = await makeGroup(alice)

    const [created] = await Promise.all([
      makeEvent(alice, groupId),
      join(groupId, bob, `bob-${round}@example.test`),
    ])
    const eventId = await eventIdOf(created)

    const count = await prisma.eventParticipant.count({
      where: { eventId, userId: await userId(bob) },
    })
    expect(count).toBe(1)
  }
})
```

Avant d'écrire le test de dépense, vérifier le corps attendu par `POST /events/:id/expenses`
dans `api/src/modules/expenses/schema.ts` et ajuster les champs (`label`, `amountCents`,
`splitMode`) à leurs noms réels : le test doit créer une dépense valide, `201`.

- [ ] **Étape 2 : les voir échouer**

Lancer : `npm test --workspace api -- group-events`
Attendu : ÉCHEC sur « ajoute un nouvel arrivant », « notifie… », et le test de course.

- [ ] **Étape 3 : `joinGroup`**

Dans `api/src/modules/invitations/service.ts`, importer
`import { notify } from '../../lib/notify.ts'`, `import { publish } from '../../lib/sse.ts'`
et `import { enrollInUpcomingEvents, lockGroup } from '../groups/enrollment.ts'`, puis
remplacer `joinGroup` :

```ts
// Un groupe n'a pas de RSVP : on en est membre ou non. « Je ne sais pas » n'a donc pas de
// sens ici, et l'interface ne le propose pas pour une invitation de groupe.
//
// Entrer dans un groupe, c'est aussi être invité à ses sorties **pas encore commencées** :
// point de passage unique des trois canaux (lien, adresse, invitation interne), c'est ici
// que l'inscription vit. Le verrou ordonne cette arrivée face à une création simultanée.
async function joinGroup(userId: string, groupId: string): Promise<void> {
  const enrolled = await prisma.$transaction(async (tx) => {
    if (!(await lockGroup(tx, groupId))) {
      throw new ApiError('group_not_found', 404, 'Groupe introuvable.')
    }

    await tx.groupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, role: 'member' },
      update: {},
    })

    return enrollInUpcomingEvents(tx, groupId, userId)
  })

  for (const participation of enrolled) {
    await notify({
      userIds: [userId],
      type: 'event.invited',
      eventId: participation.eventId,
      payload: { title: participation.title },
    })
    publish(participation.eventId, { type: 'participant.joined', id: participation.participantId })
  }
}
```

- [ ] **Étape 4 : le flux côté web**

Dans `web/src/composables/useEventStream.ts` :

```ts
const PARTICIPANT_TYPES = ['participant.rsvp', 'participant.joined'] as const
```

- [ ] **Étape 5 : les voir passer, puis prouver le verrou**

Lancer : `npm test --workspace api -- group-events` — attendu : tout PASS.

Puis, **sans commiter**, remplacer temporairement le corps de `lockGroup` par
`return (await tx.group.count({ where: { id: groupId } })) > 0` et relancer trois fois le seul
test de course (`-t "se croisent"`). Attendu : au moins un échec. Restaurer (`git checkout --
api/src/modules/groups/enrollment.ts`) et relancer : PASS. Si le test ne tombe jamais sans le
verrou, le signaler dans le compte rendu plutôt que de le garder tel quel.

- [ ] **Étape 6 : portes puis commit**

```sh
git add api/src/modules/invitations/service.ts web/src/composables/useEventStream.ts api/tests/modules/group-events.test.ts
git commit -m "feat(api): enroll newcomers in their group's upcoming events

A member who joins after an outing was planned would otherwise have to be
invited by hand. Only events not yet started: an outing already under way
is not an invitation anymore. Existing participations are left untouched."
```

---

### Tâche 4 : lectures — le groupe voit ses sorties, la sortie son groupe

**Fichiers :**
- Modifier : `api/src/modules/groups/service.ts` (`getGroup`)
- Modifier : `api/src/modules/events/service.ts` (`getEvent`, `listEvents`)
- Tester : `api/tests/modules/group-events.test.ts` (ajouts)

**Interfaces :**
- Produit :
  - `GET /groups/:id` → `group.events: { id, title, startsAt, endsAt, status, rsvp: 'invited' | 'accepted' | 'declined' | null }[]`, triés par `startsAt` croissant.
  - `GET /events/:id` → `event.group: { id: string; name: string } | null`.
  - `GET /events` → chaque ligne porte `groupName: string | null`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
it('liste les sorties du groupe avec la réponse de l’appelant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  const later = await eventIdOf(await makeEvent(alice, groupId, 14))
  const sooner = await eventIdOf(await makeEvent(alice, groupId, 3))

  const response = await app.request(`/api/groups/${groupId}`, { headers: bob })
  const { group } = (await response.json()) as {
    group: { events: { id: string; rsvp: string | null }[] }
  }

  expect(group.events.map((event) => event.id)).toEqual([sooner, later])
  expect(group.events.every((event) => event.rsvp === 'invited')).toBe(true)
})

// Un membre arrivé pendant un séjour en cours voit la sortie sans y être inscrit.
it('rend une réponse nulle pour une sortie à laquelle on ne participe pas', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await makeEvent(alice, groupId)
  await addMember(groupId, bob)

  const response = await app.request(`/api/groups/${groupId}`, { headers: bob })
  const { group } = (await response.json()) as { group: { events: { rsvp: string | null }[] } }

  expect(group.events[0]?.rsvp).toBeNull()
})

it('expose le groupe d’une sortie et son nom dans la liste', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)
  const inGroup = await eventIdOf(await makeEvent(alice, groupId))
  const adHoc = await eventIdOf(await makeEvent(alice))

  const detail = (await (await app.request(`/api/events/${inGroup}`, { headers: alice })).json()) as {
    event: { group: unknown }
  }
  expect(detail.event.group).toEqual({ id: groupId, name: 'Les copains' })

  const adHocDetail = (await (
    await app.request(`/api/events/${adHoc}`, { headers: alice })
  ).json()) as { event: { group: unknown } }
  expect(adHocDetail.event.group).toBeNull()

  const list = (await (await app.request('/api/events', { headers: alice })).json()) as {
    events: { id: string; groupName: string | null }[]
  }
  const nameOf = new Map(list.events.map((event) => [event.id, event.groupName]))
  expect(nameOf.get(inGroup)).toBe('Les copains')
  expect(nameOf.get(adHoc)).toBeNull()
})
```

- [ ] **Étape 2 : les voir échouer**

Lancer : `npm test --workspace api -- group-events`
Attendu : ÉCHEC — `events`, `group` et `groupName` sont `undefined`.

- [ ] **Étape 3 : `getGroup`**

Dans `getGroup`, après le chargement du groupe :

```ts
  // Pas de pagination : le volume d'un groupe d'amis ne la justifie pas. Choix non mesuré,
  // consigné comme tel au journal.
  const events = await prisma.event.findMany({
    where: { groupId },
    orderBy: { startsAt: 'asc' },
    include: { participants: { where: { userId }, select: { rsvp: true } } },
  })
```

et dans l'objet rendu, après `members` :

```ts
    // `rsvp` nul : l'appelant voit la sortie sans y participer — arrivé dans le groupe
    // après qu'elle a commencé.
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: event.status,
      rsvp: event.participants[0]?.rsvp ?? null,
    })),
```

- [ ] **Étape 4 : `getEvent` et `listEvents`**

Dans `getEvent`, étendre l'`include` : `group: { select: { id: true, name: true } },` et
ajouter `group: event.group,` après `createdBy` dans l'objet rendu.

Dans `listEvents`, remplacer `include: { event: true }` par
`include: { event: { include: { group: { select: { name: true } } } } }` et ajouter
`groupName: row.event.group?.name ?? null,` après `status`.

- [ ] **Étape 5 : les voir passer**

Lancer : `npm test --workspace api` — attendu : toute la suite API PASS (les tests existants
d'`events` utilisent `toMatchObject` ou lisent des champs précis ; un champ ajouté ne les
casse pas. Si l'un compare par `toEqual` l'objet entier, y ajouter le champ).

- [ ] **Étape 6 : portes puis commit**

```sh
git add api/src/modules api/tests/modules/group-events.test.ts
git commit -m "feat(api): show a group its outings and an outing its group

rsvp is null when the viewer is not a participant: someone who joined the
group while an outing was under way sees it without being enrolled."
```

---

### Tâche 5 : lien de création pré-rempli (web, pur)

**Fichiers :**
- Modifier : `web/src/lib/dates.ts`
- Créer : `web/src/lib/event-draft.ts`
- Tester : `web/tests/event-draft.test.ts`

**Interfaces :**
- Produit :
  - `isoToLocalInput(iso: string): string` — `YYYY-MM-DDTHH:mm` en heure locale.
  - `newEventLink(groupId: string, slot?: { startsAt: string; endsAt: string }): { path: '/events/new'; query: Record<string, string> }`
  - `readEventDraft(query: Record<string, unknown>): { groupId: string | null; startsAt: string; endsAt: string }` — dates au format `datetime-local`, chaîne vide si absentes ou invalides.

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
// web/tests/event-draft.test.ts
import { expect, it } from 'vitest'
import { isoToLocalInput, localInputToIso } from '../src/lib/dates.ts'
import { newEventLink, readEventDraft } from '../src/lib/event-draft.ts'

// Construit en heure locale : en UTC, l'instant franchirait minuit dans certains fuseaux.
const local = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()

it('rend un instant au format datetime-local, en heure locale', () => {
  expect(isoToLocalInput(local(3, 9))).toBe('2026-10-03T09:00')
})

it('fait l’aller-retour avec localInputToIso', () => {
  const iso = local(12, 18)
  expect(localInputToIso(isoToLocalInput(iso))).toBe(iso)
})

it('construit le lien d’un groupe sans créneau', () => {
  expect(newEventLink('g-1')).toEqual({ path: '/events/new', query: { group: 'g-1' } })
})

it('construit le lien d’un créneau', () => {
  const slot = { startsAt: local(3, 9), endsAt: local(3, 18) }

  expect(newEventLink('g-1', slot)).toEqual({
    path: '/events/new',
    query: { group: 'g-1', startsAt: slot.startsAt, endsAt: slot.endsAt },
  })
})

it('relit un lien de créneau en valeurs de formulaire', () => {
  const query = newEventLink('g-1', { startsAt: local(3, 9), endsAt: local(3, 18) }).query

  expect(readEventDraft(query)).toEqual({
    groupId: 'g-1',
    startsAt: '2026-10-03T09:00',
    endsAt: '2026-10-03T18:00',
  })
})

it('rend un brouillon vide sans paramètres', () => {
  expect(readEventDraft({})).toEqual({ groupId: null, startsAt: '', endsAt: '' })
})

// Un lien tapé ou tronqué ne doit pas afficher « Invalid Date » dans le champ.
it('ignore une date illisible', () => {
  expect(readEventDraft({ startsAt: 'demain', endsAt: ['a', 'b'] })).toEqual({
    groupId: null,
    startsAt: '',
    endsAt: '',
  })
})
```

- [ ] **Étape 2 : les voir échouer**

Lancer : `npm test --workspace web -- event-draft`
Attendu : ÉCHEC — modules et fonctions introuvables.

- [ ] **Étape 3 : implémenter**

Ajouter à `web/src/lib/dates.ts` :

```ts
// Inverse de `localInputToIso` : ISO 8601 → valeur d'un <input type="datetime-local">, en
// heure locale. `toISOString` rendrait l'heure UTC, décalée d'autant que le fuseau.
export function isoToLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

Créer `web/src/lib/event-draft.ts` :

```ts
import { isoToLocalInput } from './dates'

// Lien vers le formulaire de création, porteur d'un groupe et, depuis un créneau libre, de
// ses bornes. Les dates voyagent en ISO dans l'URL — sans ambiguïté de fuseau — et ne
// deviennent de l'heure locale qu'à la lecture.

type Slot = { startsAt: string; endsAt: string }

export function newEventLink(groupId: string, slot?: Slot) {
  const query: Record<string, string> =
    slot === undefined
      ? { group: groupId }
      : { group: groupId, startsAt: slot.startsAt, endsAt: slot.endsAt }

  return { path: '/events/new' as const, query }
}

function readInstant(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return ''
  }
  return isoToLocalInput(value)
}

export function readEventDraft(query: Record<string, unknown>) {
  return {
    groupId: typeof query.group === 'string' && query.group !== '' ? query.group : null,
    startsAt: readInstant(query.startsAt),
    endsAt: readInstant(query.endsAt),
  }
}
```

- [ ] **Étape 4 : les voir passer**

Lancer : `npm test --workspace web -- event-draft` — attendu : 7 tests PASS.

- [ ] **Étape 5 : portes puis commit**

```sh
git add web/src/lib/dates.ts web/src/lib/event-draft.ts web/tests/event-draft.test.ts
git commit -m "feat(web): build and read a prefilled new-event link

Dates travel as ISO in the URL and only become local time when read back,
so a link shared across time zones still means the same instant."
```

---

### Tâche 6 : interface

**Fichiers :**
- Modifier : `web/src/composables/useGroup.ts`, `useEvent.ts`, `useEvents.ts`
- Modifier : `web/src/views/EventCreateView.vue`, `GroupView.vue`, `EventView.vue`, `HomeView.vue`
- Modifier : `web/src/components/FreeSlots.vue`

**Interfaces :**
- Consomme : champs API de la tâche 4 ; `newEventLink`, `readEventDraft` de la tâche 5 ;
  `useGroups()` existant (`groups: Ref<GroupSummary[]>`, `state`).

Pas de test automatisé : la logique testable vit dans `event-draft.ts` (tâche 5), et les
vues du projet ne sont pas testées unitairement. Vérification par typage et à la main
(étape 7).

- [ ] **Étape 1 : types**

`useGroup.ts` — ajouter, et `events: GroupEvent[]` dans `GroupDetail` :

```ts
export type GroupEvent = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  status: 'draft' | 'active' | 'closed'
  rsvp: 'invited' | 'accepted' | 'declined' | null
}
```

`useEvent.ts` — dans `EventDetail`, après `createdBy` : `group: { id: string; name: string } | null`.

`useEvents.ts` — dans `EventSummary`, après `status` : `groupName: string | null`.

- [ ] **Étape 2 : `EventCreateView.vue`**

Dans le `<script setup>` :

```ts
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroups } from '../composables/useGroups'
import { localInputToIso } from '../lib/dates'
import { readEventDraft } from '../lib/event-draft'
import { ApiFetchError, apiFetch } from '../lib/http'

const router = useRouter()
const draft = readEventDraft(useRoute().query)

// Venu d'un groupe, le groupe est fixé : le sélecteur n'aurait rien à choisir.
const lockedGroupId = draft.groupId
const { groups } = useGroups()
const selectedGroupId = ref('')
const groupId = computed(() => lockedGroupId ?? (selectedGroupId.value || null))
// `null` tant que la liste charge, ou si le lien vise un groupe dont on n'est pas membre :
// l'en-tête ne nomme alors aucun groupe, et l'API tranchera par un 403 à l'envoi.
const lockedGroupName = computed(
  () => groups.value.find((group) => group.id === lockedGroupId)?.name ?? null,
)

const title = ref('')
const description = ref('')
const startsAt = ref(draft.startsAt)
const endsAt = ref(draft.endsAt)
```

et dans le corps envoyé par `submit`, ajouter `groupId: groupId.value ?? undefined,`.

Dans `submit`, avant le message générique, traiter le refus :

```ts
    if (cause instanceof ApiFetchError && cause.code === 'not_a_member') {
      message.value = "Vous ne faites pas partie de ce groupe : la sortie n'a pas été créée."
      return
    }
```

Dans le gabarit, entre la description et les dates :

```vue
      <p
        v-if="lockedGroupId && lockedGroupName"
        class="rounded-field border border-line bg-surface p-3.5 text-[13px] leading-relaxed"
      >
        Sortie du groupe <span class="font-semibold">{{ lockedGroupName }}</span> : tous ses
        membres seront invités.
      </p>

      <label v-else-if="!lockedGroupId && groups.length > 0" class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-label">Groupe</span>
        <select
          v-model="selectedGroupId"
          class="h-13 rounded-field border border-field bg-surface px-3.5 text-[15px] shadow-rest outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        >
          <option value="">Aucun (sortie ad hoc)</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </option>
        </select>
        <span v-if="selectedGroupId" class="text-xs text-faint">
          Tous les membres du groupe seront invités.
        </span>
      </label>
```

- [ ] **Étape 3 : `FreeSlots.vue` — créneau cliquable**

Ajouter la prop `groupId: string`, importer `RouterLink` et `newEventLink`, et remplacer le
contenu de chaque `<li>` d'un créneau libre par un lien de même apparence :

```vue
        <li v-for="slot in free" :key="slot.startsAt">
          <RouterLink
            :to="newEventLink(groupId, slot)"
            class="flex flex-wrap items-center justify-between gap-2 rounded-field border border-free-line bg-free px-4 py-3 transition-colors hover:border-free-ink"
            :aria-label="`Organiser une sortie ${formatSlot(slot.startsAt, slot.endsAt)}`"
          >
            <span class="text-sm font-semibold text-free-ink-strong">
              {{ formatSlot(slot.startsAt, slot.endsAt) }}
            </span>
            <span class="text-xs font-semibold text-free-ink">
              {{ formatDuration(slot.startsAt, slot.endsAt) }}
            </span>
          </RouterLink>
        </li>
```

Sous la liste, une ligne d'aide : `<p class="text-xs text-faint">Touchez un créneau pour y
organiser une sortie.</p>` (affichée seulement quand `free.length > 0`).

- [ ] **Étape 4 : `GroupView.vue`**

Passer `:group-id="group.id"` à `FreeSlots`. Importer `newEventLink`, `formatPeriod` et
`RouterLink` (déjà importé). Ajouter, avant la section « Membres » :

```vue
        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-[13px] font-semibold text-label">Sorties du groupe</h2>
            <RouterLink
              :to="newEventLink(group.id)"
              class="flex h-10 items-center rounded-control bg-accent px-4 text-sm font-semibold text-white"
            >
              Nouvelle sortie
            </RouterLink>
          </div>

          <p v-if="group.events.length === 0" class="text-[13px] text-muted">
            Aucune sortie pour l'instant. Choisissez un créneau libre ci-dessus.
          </p>

          <ul v-else class="flex flex-col rounded-card border border-line bg-surface">
            <li v-for="event in group.events" :key="event.id" class="border-b border-line-soft last:border-b-0">
              <RouterLink :to="`/events/${event.id}`" class="flex flex-col gap-0.5 px-4 py-3">
                <span class="text-sm font-medium">{{ event.title }}</span>
                <span class="text-xs text-muted">{{ formatPeriod(event.startsAt, event.endsAt) }}</span>
                <span v-if="event.rsvp" class="text-xs" :class="rsvpTone[event.rsvp]">
                  {{ rsvpLabel[event.rsvp] }}
                </span>
              </RouterLink>
            </li>
          </ul>
        </section>
```

avec, dans le script, les mêmes tables que `HomeView.vue` :

```ts
const rsvpLabel: Record<string, string> = {
  invited: 'À confirmer',
  accepted: 'Vous participez',
  declined: 'Vous avez décliné',
}

const rsvpTone: Record<string, string> = {
  invited: 'text-wait-ink',
  accepted: 'text-muted',
  declined: 'text-muted',
}
```

- [ ] **Étape 5 : `EventView.vue` et `HomeView.vue`**

`EventView.vue`, sous la ligne de période (≈ ligne 399) :

```vue
          <RouterLink
            v-if="event.group"
            :to="`/groups/${event.group.id}`"
            class="text-[13px] font-semibold text-accent"
          >
            Groupe {{ event.group.name }}
          </RouterLink>
```

(importer `RouterLink` depuis `vue-router` s'il ne l'est pas).

`HomeView.vue`, sous la ligne de période d'une carte :

```vue
            <span v-if="event.groupName" class="text-xs text-muted">
              {{ event.groupName }}
            </span>
```

- [ ] **Étape 6 : portes**

`npx biome check --write .` — vérifier ensuite `git status` : si un `.vue` a été modifié par
Biome, `git checkout -- <fichier>` puis réappliquer à la main ce que l'étape voulait.
Puis `npm run typecheck`, puis `npm test`.

- [ ] **Étape 7 : vérification à la main**

`npm run db:seed`, puis `npm run dev`, puis dans le navigateur à 375 px et en bureau :
1. Groupe du jeu d'essai → « Nouvelle sortie » : pas de sélecteur, rappel du groupe.
2. Groupe → un créneau libre : dates pré-remplies à l'heure locale attendue.
3. Accueil → « Nouvelle sortie » : sélecteur présent, « Aucun » par défaut.
4. Créer dans un groupe : l'événement affiche le lien vers le groupe ; le groupe liste la sortie ;
   l'accueil d'un autre membre montre la sortie « À confirmer » et une notification.
5. `/events/new?group=00000000-0000-4000-8000-000000000000` : aucun nom de groupe affiché,
   l'envoi rend le message d'erreur.

Consigner dans le compte rendu ce qui a été vérifié, et ce qui ne l'a pas été.

- [ ] **Étape 8 : commit**

```sh
git add web/src
git commit -m "feat(web): plan an outing from a group or one of its free slots

The shared calendar found a slot but offered no way to act on it. The
group selector is hidden when coming from a group, where it has nothing
left to choose."
```

---

### Tâche 7 : documentation

**Fichiers :**
- Modifier : `docs/conception.md` (§2.5, §5.1, §5.2)
- Modifier : `docs/journal-decisions.md`
- Modifier : `CLAUDE.md` (« État actuel »)

- [ ] **Étape 1 : `conception.md`**

- §2.5, sous le bloc SQL : `group_id` porte une clé étrangère `ON DELETE SET NULL`. Ajouter la
  règle : créer un événement dans un groupe invite d'office ses autres membres (`member`,
  `invited`) ; entrer dans un groupe inscrit aux événements pas encore commencés
  (`starts_at > maintenant`), sans toucher une participation existante ; le groupe est fixé à
  la création.
- §5.1 : `POST /events` accepte `groupId` ; `GET /groups/:id` rend les sorties du groupe.
- §5.2 : ajouter `participant.joined` à la liste des types, avec une phrase : il est émis quand
  une arrivée dans un groupe inscrit quelqu'un à un événement.

- [ ] **Étape 2 : `journal-decisions.md`**

Nouvelle section « Événements de groupe » avant « Points laissés ouverts », dans le style des
jalons : les décisions de la spec avec leur *coût si erroné* — invitation d'office plutôt
qu'adhésion libre ; `starts_at > maintenant` ; tout membre crée ; verrou de ligne ;
`SET NULL` ; pas de pagination (non mesuré) ; `participant.joined` non émis par une entrée
directe dans un événement par lien (hors périmètre, à aligner plus tard).

Dans « Points laissés ouverts » : retirer `events.group_id reste inutilisé` ; remplacer le
point « Déploiement M1 — mise en service à faire » par : l'application est en ligne sur
`https://onsort.eliott-b.fr` ; les évolutions s'accumulent sur la branche `feature` pour un
déploiement groupé.

- [ ] **Étape 3 : `CLAUDE.md`**

« État actuel » : remplacer le paragraphe « Reste dû, hors code » par l'état réel — en ligne
sur `https://onsort.eliott-b.fr` ; le travail se fait sur des branches `feat/*` tirées de
`feature`, fusionnées dans `feature`, déployées ensemble. Mentionner les événements de groupe
dans la description du produit.

- [ ] **Étape 4 : portes puis commit**

```sh
git add docs CLAUDE.md
git commit -m "docs: record group events and the feature-branch workflow

The deployment open point was stale: the app has been live for a while.
group_id is no longer unused."
```

---

## Clôture

Fusion de `feat/group-events` dans `feature` après revue de la branche entière. Pas de
déploiement : il sera groupé.
