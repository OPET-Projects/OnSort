# Jalon M4 — groupes, calendrier partagé, superposition des indisponibilités

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** un groupe de personnes qui sortent souvent ensemble déclare chacun ses
indisponibilités, et l'application superpose ces calendriers pour faire apparaître **les
créneaux où tout le monde est libre**. C'est la démonstration de M4 — « le créneau qui
convient à tous » — et le différenciateur du sujet : `docs/conception.md` §9 le fait passer
devant la carte, « en cas de coupe, mieux vaut perdre la carte ».

**Architecture :** toute l'arithmétique des intervalles vit dans `api/src/lib/calendar.ts`,
fonctions pures sans entrées-sorties — comme `lib/vote.ts` en M2 et `lib/money.ts` en M3.
Le calendrier partagé est une **vue calculée, jamais une table** (§2.4). L'appartenance à un
groupe réutilise la machinerie d'invitation de M1, dont le modèle est polymorphe depuis sa
première migration.

**Stack :** aucune montée de version, aucune dépendance nouvelle.

**Conception :** [`../conception.md`](../conception.md) — sections 2.3, 2.4, 2.6, 4, 5.1,
6.1, 7.1, 9. **Fait autorité.**
**Décisions :** [`../decisions-techniques.md`](../decisions-techniques.md) — §2.3, qui
explique pourquoi la non-superposition est en couche service et non en contrainte `EXCLUDE`.
**Jalon précédent :** [`2026-09-09-m3-depenses-parts-soldes-reglement.md`](2026-09-09-m3-depenses-parts-soldes-reglement.md).

## Contraintes globales

- Node **24.20.0** (`.nvmrc`). Versions **épinglées à l'exact**, aucune montée dans M4.
- **Une migration par jalon.** M4 ajoute exactement trois tables : `groups`, `group_members`,
  `unavailability`.
- **Intervalles semi-ouverts** : `starts_at` inclus, `ends_at` exclu (§2.4). Deux créneaux
  adjacents ne se chevauchent donc pas, et le test s'écrit
  `starts_at < :end AND ends_at > :start`. Toute comparaison écrite autrement est un défaut.
- **`label` est privé.** Il ne franchit jamais une réponse de groupe : le groupe voit
  « occupé », jamais la raison. Un test doit échouer si un libellé apparaît dans une réponse
  de calendrier partagé.
- Portes de vérification avant **chaque** commit, dans cet ordre, **chacune lancée seule** :
  `npx biome check --write .`, `npm run typecheck`, `npm test`. Jamais à travers un tube —
  voir le piège consigné dans `CLAUDE.md`.
- **Ne jamais lancer la correction automatique de Biome sur un `.vue`.**
- Après tout `git pull` touchant `schema.prisma` : `npm run db:generate --workspace api`.
- **Forme d'erreur uniforme** `{ code, message, details }` via `ApiError`.
- **Anti-énumération de comptes** (§4) : ajouter un membre par adresse rend toujours la même
  réponse, que le compte existe ou non.

## Périmètre

**Dans M4 :**

| Domaine | Contenu |
| --- | --- |
| Base | `Group`, `GroupMember`, `Unavailability`, migration `m4_groups` |
| Pur | `lib/calendar.ts` — fusion des plages, superposition, créneaux libres |
| Permissions | `canManageGroup(role)` |
| API groupes | `GET`/`POST /api/groups`, `GET /api/groups/:id`, `POST /api/groups/:id/members` |
| API calendrier | `GET /api/groups/:id/calendar` — fenêtre `from`/`to` |
| API personnel | `GET`/`POST /api/me/unavailability`, `DELETE /api/me/unavailability/:id` |
| Invitations | `scope: 'group'` admis par le chemin d'acceptation existant |
| Front | `/me/calendar`, `/groups`, `/groups/:id` |

**Hors M4 — appartient à un jalon nommé, ne pas anticiper :**

| Écarté | Jalon | Motif |
| --- | --- | --- |
| Créer un événement **depuis** un créneau libre, remplir `events.group_id` | **non planifié** | §9 borne M4 à « groupes, calendrier partagé, superposition ». La colonne existe depuis M1 et reste inutilisée : la remplir demande une décision de produit qui n'a pas été prise |
| Amis, `/friends` | **M6** | §9 range les amis en M6 |
| Notifications d'ajout à un groupe | **M6** | Idem |
| Carte, géocodage | **M5** | |

**Ce que M4 ne crée pas :** aucune table de calendrier partagé. C'est une **vue calculée**
(§2.4) ; la matérialiser serait un cache qu'aucune mesure ne justifie, et une source de
vérité de plus à tenir à jour.

---

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `api/src/lib/calendar.ts` | **Créé.** Intervalles : fusion, superposition, complément |
| `api/src/lib/permissions.ts` | **Modifié.** `canManageGroup` |
| `api/src/modules/groups/schema.ts` | **Créé.** Schémas zod |
| `api/src/modules/groups/service.ts` | **Créé.** Groupes, membres, calendrier partagé |
| `api/src/modules/groups/routes.ts` | **Créé.** |
| `api/src/modules/calendar/schema.ts` | **Créé.** Indisponibilités personnelles |
| `api/src/modules/calendar/service.ts` | **Créé.** Écriture fusionnante, lecture |
| `api/src/modules/calendar/routes.ts` | **Créé.** Monté sous `/api/me` |
| `api/src/modules/invitations/service.ts` | **Modifié.** `scope: 'group'` |
| `web/src/composables/useCalendar.ts` | **Créé.** |
| `web/src/composables/useGroups.ts`, `useGroup.ts` | **Créés.** |
| `web/src/views/CalendarView.vue`, `GroupsView.vue`, `GroupView.vue` | **Créés.** |
| `web/src/components/FreeSlots.vue` | **Créé.** |

---

## Décisions de ce jalon à consigner

À reporter dans [`../journal-decisions.md`](../journal-decisions.md), avec leur coût :

1. **Ajouter un membre par adresse passe par la machinerie d'invitation de M1.** §5.1 liste
   `POST /groups/:id/members`, ce qui pourrait se lire « insère cette personne ». Ce serait
   un oracle d'énumération : la réponse dirait si l'adresse a un compte. La route crée donc
   une `Invitation` de `scope: 'group'` — valeur déclarée dès M1 « pour que le modèle
   polymorphe soit complet » — et rend la même réponse dans tous les cas. On ne rejoint
   jamais un groupe sans l'avoir accepté.
2. **`GET /groups/:id/calendar` rend les occupations *et* les créneaux libres.** §2.4 ne
   décrit que la superposition. Rendre les seules occupations obligerait le front à
   recalculer le complément, donc à dupliquer la règle des bornes semi-ouvertes ; rendre les
   seuls créneaux libres empêcherait d'afficher qui bloque quoi. Les deux voyagent ensemble.
3. **La fenêtre `from`/`to` est obligatoire et bornée à 90 jours.** Sans borne, un appel sur
   dix ans lirait toute la table. Le refus porte un code distinct, `window_too_wide`.
4. **Les indisponibilités qui se touchent sont fusionnées, jamais rejetées** (§2.4,
   `decisions-techniques` §2.3). L'écriture se fait dans une transaction avec verrou de
   ligne. C'est la meilleure ergonomie *et* le seul moyen de tenir l'invariant sans la
   contrainte `EXCLUDE` écartée.
5. **Supprimer une plage fusionnée supprime la plage résultante, pas la saisie d'origine.**
   La fusion perd les frontières initiales — c'est le prix assumé de la décision précédente.

---

## Tâche 1 : modèles, migration, remise à zéro

**Fichiers :**
- Modifier : `api/prisma/schema.prisma`, `api/tests/helpers/db.ts`
- Créer : migration `m4_groups`, `api/tests/schema-m4.test.ts`

**Interfaces :**
- Produit : `Group`, `GroupMember`, `Unavailability` ; enum `GroupRole`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeUser(email: string) {
  return prisma.user.create({ data: { id: `u-${email}`, name: email, email } })
}

it('relie un groupe à ses membres', async () => {
  const alice = await makeUser('alice@example.test')
  const group = await prisma.group.create({
    data: {
      name: 'Les copains',
      createdBy: alice.id,
      members: { create: { userId: alice.id, role: 'admin' } },
    },
    include: { members: true },
  })

  expect(group.members).toHaveLength(1)
  expect(group.members[0]?.role).toBe('admin')
})

it("n'accepte qu'une adhésion par personne et par groupe", async () => {
  const alice = await makeUser('alice@example.test')
  const group = await prisma.group.create({ data: { name: 'G', createdBy: alice.id } })

  await prisma.groupMember.create({ data: { groupId: group.id, userId: alice.id } })

  await expect(
    prisma.groupMember.create({ data: { groupId: group.id, userId: alice.id } }),
  ).rejects.toThrow()
})

// Bornes semi-ouvertes (§2.4) : une plage vide ou inversée n'a pas de sens.
it('refuse une plage dont la fin ne suit pas le début', async () => {
  const alice = await makeUser('alice@example.test')

  await expect(
    prisma.unavailability.create({
      data: {
        userId: alice.id,
        startsAt: new Date('2026-10-02T00:00:00Z'),
        endsAt: new Date('2026-10-01T00:00:00Z'),
      },
    }),
  ).rejects.toThrow()
})

it('garde le libellé facultatif', async () => {
  const alice = await makeUser('alice@example.test')

  const row = await prisma.unavailability.create({
    data: {
      userId: alice.id,
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: new Date('2026-10-02T00:00:00Z'),
    },
  })

  expect(row.label).toBeNull()
})
```

- [ ] **Étape 2 : lancer et voir échouer**

```sh
npm test --workspace api -- schema-m4
```

Attendu : `Property 'group' does not exist on type 'PrismaClient'`.

- [ ] **Étape 3 : écrire les modèles**

```prisma
// --- M4 : groupes et calendrier partagé --------------------------------------------------
// Modèle : conception.md §2.3 et §2.4.

enum GroupRole {
  admin
  member
}

model Group {
  id        String        @id @default(uuid())
  name      String
  createdBy String        @map("created_by")
  creator   User          @relation("GroupCreator", fields: [createdBy], references: [id])
  createdAt DateTime      @default(now()) @map("created_at")
  members   GroupMember[]

  @@map("groups")
}

model GroupMember {
  groupId  String    @map("group_id")
  group    Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  userId   String    @map("user_id")
  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role     GroupRole @default(member)
  joinedAt DateTime  @default(now()) @map("joined_at")

  @@id([groupId, userId])
  @@index([userId])
  @@map("group_members")
}

// Indisponibilité personnelle. `label` est **privé** : il ne franchit jamais une réponse de
// groupe, qui ne dit que « occupé » (§2.4).
//
// Bornes semi-ouvertes : `starts_at` inclus, `ends_at` exclu. Deux créneaux adjacents ne se
// chevauchent donc pas.
//
// La non-superposition n'est pas garantie par la base : la contrainte `EXCLUDE USING gist`
// qui l'aurait assurée a été écartée faute de support ORM (decisions-techniques §2.3). Elle
// est tenue en couche service, par fusion à l'écriture.
model Unavailability {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  startsAt  DateTime @map("starts_at")
  endsAt    DateTime @map("ends_at")
  label     String?
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, startsAt])
  @@map("unavailability")
}
```

Relations inverses sur `User` : `groupsCreated`, `groupMemberships`, `unavailability`.

- [ ] **Étape 4 : générer la migration, puis y ajouter la contrainte**

```sh
npm run db:migrate --workspace api -- --name m4_groups
```

Éditer le `.sql` **avant toute autre application**, puis reconstruire le schéma :

```sql
-- Bornes semi-ouvertes : une plage vide ou inversée n'est pas une indisponibilité.
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_period_ordered"
  CHECK ("ends_at" > "starts_at");
```

```sh
docker exec onsort-db psql -U onsort -d onsort -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npm run db:migrate --workspace api
```

- [ ] **Étape 5 : étendre `TABLES`** de `api/tests/helpers/db.ts` avec `unavailability`,
  `group_members`, `groups`, **en tête de liste**.

- [ ] **Étape 6 : lancer et voir passer**, puis les trois portes, puis commiter.

```
feat(api): add the group and availability models

The non-overlap invariant is not enforced by the database: the EXCLUDE
constraint that would have guaranteed it was dropped for lack of ORM support,
so the service layer merges touching ranges on write instead.
```

---

## Tâche 2 : fusion des plages

**Fichiers :**
- Créer : `api/src/lib/calendar.ts`, `api/tests/lib/calendar.test.ts`

**Interfaces :**
- Produit :

```ts
export type Interval = { startsAt: Date; endsAt: Date }
export function mergeIntervals(intervals: readonly Interval[]): Interval[]
```

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { expect, it } from 'vitest'
import { mergeIntervals } from '../../src/lib/calendar.ts'

const at = (day: number, hour = 0) =>
  new Date(Date.UTC(2026, 9, day, hour))

const span = (a: [number, number], b: [number, number]) => ({
  startsAt: at(a[0], a[1]),
  endsAt: at(b[0], b[1]),
})

it('laisse intactes des plages disjointes, triées', () => {
  expect(mergeIntervals([span([3, 0], [4, 0]), span([1, 0], [2, 0])])).toEqual([
    span([1, 0], [2, 0]),
    span([3, 0], [4, 0]),
  ])
})

it('fusionne deux plages qui se recouvrent', () => {
  expect(mergeIntervals([span([1, 0], [3, 0]), span([2, 0], [4, 0])])).toEqual([
    span([1, 0], [4, 0]),
  ])
})

// Bornes semi-ouvertes : deux plages adjacentes ne se **chevauchent** pas, mais les fusionner
// est la bonne ergonomie — « occupé du 1 au 2 » puis « du 2 au 3 » est une seule absence.
it('fusionne deux plages adjacentes', () => {
  expect(mergeIntervals([span([1, 0], [2, 0]), span([2, 0], [3, 0])])).toEqual([
    span([1, 0], [3, 0]),
  ])
})

it('absorbe une plage entièrement contenue dans une autre', () => {
  expect(mergeIntervals([span([1, 0], [5, 0]), span([2, 0], [3, 0])])).toEqual([
    span([1, 0], [5, 0]),
  ])
})

it('enchaîne une fusion en cascade', () => {
  expect(
    mergeIntervals([span([1, 0], [2, 0]), span([3, 0], [4, 0]), span([2, 0], [3, 0])]),
  ).toEqual([span([1, 0], [4, 0])])
})

it('rend une liste vide sur une entrée vide', () => {
  expect(mergeIntervals([])).toEqual([])
})
```

- [ ] **Étape 2 : lancer et voir échouer.**

- [ ] **Étape 3 : écrire l'implémentation**

```ts
// Arithmétique des intervalles du calendrier (conception §2.4). Fonctions pures, sans
// entrées-sorties : c'est là que porte l'effort de test.
//
// **Convention de bornes : semi-ouvertes.** `startsAt` est inclus, `endsAt` est exclu. Deux
// créneaux adjacents ne se chevauchent donc pas, et tout test de chevauchement s'écrit
// `startsAt < autre.endsAt && endsAt > autre.startsAt`. L'écrire avec un `<=` quelque part
// ferait apparaître des conflits là où il n'y en a pas.

export type Interval = {
  startsAt: Date
  endsAt: Date
}

// Fusionne les plages qui se recouvrent **ou se touchent**. Se toucher n'est pas se
// chevaucher en bornes semi-ouvertes ; on fusionne quand même, parce que « occupé du 1 au 2 »
// suivi de « du 2 au 3 » est une seule absence, et que l'invariant de non-superposition de
// §2.4 est tenu ici faute de contrainte en base.
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  )

  const merged: Interval[] = []

  for (const current of sorted) {
    const last = merged.at(-1)

    if (last !== undefined && current.startsAt.getTime() <= last.endsAt.getTime()) {
      if (current.endsAt.getTime() > last.endsAt.getTime()) {
        last.endsAt = current.endsAt
      }
      continue
    }

    merged.push({ startsAt: current.startsAt, endsAt: current.endsAt })
  }

  return merged
}
```

- [ ] **Étape 4 : voir passer.** **Étape 5 : portes, commit.**

```
feat(api): merge overlapping and touching unavailability ranges

Touching is not overlapping under half-open bounds, but merging anyway is both
the better ergonomics and the only way to hold the non-overlap invariant that
the dropped EXCLUDE constraint would have guaranteed.
```

---

## Tâche 3 : créneaux libres d'un groupe

**Fichiers :** modifier `api/src/lib/calendar.ts` et son test.

**Interfaces :**
- Produit :

```ts
export function freeSlots(
  window: Interval,
  busy: readonly Interval[],
  minimumMinutes?: number,
): Interval[]
```

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
it('rend la fenêtre entière quand personne n’est occupé', () => {
  expect(freeSlots(span([1, 0], [5, 0]), [])).toEqual([span([1, 0], [5, 0])])
})

it('retranche une occupation centrale', () => {
  expect(freeSlots(span([1, 0], [5, 0]), [span([2, 0], [3, 0])])).toEqual([
    span([1, 0], [2, 0]),
    span([3, 0], [5, 0]),
  ])
})

it('rend une liste vide quand la fenêtre est entièrement occupée', () => {
  expect(freeSlots(span([1, 0], [5, 0]), [span([1, 0], [5, 0])])).toEqual([])
})

// Les occupations débordant la fenêtre ne doivent pas la déborder en retour.
it('borne les occupations à la fenêtre', () => {
  expect(freeSlots(span([2, 0], [4, 0]), [span([1, 0], [3, 0])])).toEqual([
    span([3, 0], [4, 0]),
  ])
})

it('fusionne les occupations avant de retrancher', () => {
  expect(
    freeSlots(span([1, 0], [6, 0]), [span([2, 0], [4, 0]), span([3, 0], [5, 0])]),
  ).toEqual([span([1, 0], [2, 0]), span([5, 0], [6, 0])])
})

// Un trou de dix minutes entre deux réunions n'est pas un créneau de sortie.
it('écarte les créneaux plus courts que la durée minimale', () => {
  const slots = freeSlots(span([1, 0], [1, 5]), [], 120)
  expect(slots).toEqual([])
})
```

- [ ] **Étape 3 : écrire l'implémentation**

```ts
// Créneaux libres sur une fenêtre : le complément des occupations, borné à la fenêtre.
// C'est le calcul qui porte la démonstration du jalon — « le créneau qui convient à tous ».
//
// `minimumMinutes` écarte les miettes : un trou de dix minutes entre deux réunions n'est pas
// un créneau de sortie, et l'afficher noierait les vrais.
export function freeSlots(
  window: Interval,
  busy: readonly Interval[],
  minimumMinutes = 0,
): Interval[] {
  const clipped = busy
    .map((interval) => ({
      startsAt: new Date(Math.max(interval.startsAt.getTime(), window.startsAt.getTime())),
      endsAt: new Date(Math.min(interval.endsAt.getTime(), window.endsAt.getTime())),
    }))
    .filter((interval) => interval.endsAt.getTime() > interval.startsAt.getTime())

  const slots: Interval[] = []
  let cursor = window.startsAt

  for (const interval of mergeIntervals(clipped)) {
    if (interval.startsAt.getTime() > cursor.getTime()) {
      slots.push({ startsAt: cursor, endsAt: interval.startsAt })
    }
    if (interval.endsAt.getTime() > cursor.getTime()) {
      cursor = interval.endsAt
    }
  }

  if (cursor.getTime() < window.endsAt.getTime()) {
    slots.push({ startsAt: cursor, endsAt: window.endsAt })
  }

  const minimumMs = minimumMinutes * 60_000

  return slots.filter((slot) => slot.endsAt.getTime() - slot.startsAt.getTime() >= minimumMs)
}
```

- [ ] **Étapes 4 et 5 : voir passer, portes, commit.**

```
feat(api): compute the slots where a whole group is free

Busy ranges are clipped to the window before the complement is taken: an
absence that starts before the window must not push the first free slot outside
of it.
```

---

## Tâche 4 : indisponibilités personnelles

**Fichiers :** `api/src/modules/calendar/{schema,service,routes}.ts`, `api/src/main.ts`,
`api/tests/modules/calendar.test.ts`.

**Interfaces :**
- Produit : `listUnavailability(userId, window)`, `addUnavailability(userId, input)`,
  `removeUnavailability(userId, id)` ; routes `GET`/`POST /api/me/unavailability` et
  `DELETE /api/me/unavailability/:id`.

- [ ] **Étape 1 : écrire le test qui échoue** — couvrir :
  - création simple, `201`
  - **fusion** : deux ajouts qui se touchent laissent **une** ligne
  - refus d'une fin antérieure au début → `invalid_period`
  - lecture bornée par `from`/`to`
  - suppression par son propriétaire → `200`
  - suppression de la plage d'autrui → `404`, jamais `403` : répondre « interdit » dirait
    que cette plage existe
  - session obligatoire → `401`

- [ ] **Étape 3 : écrire le service**

```ts
// Ajout d'une indisponibilité, avec **fusion** des plages qui se touchent ou se recouvrent
// (§2.4). La transaction et le verrou de ligne ne sont pas décoratifs : deux ajouts
// simultanés liraient sinon le même état, écriraient deux lignes disjointes, et
// l'invariant de non-superposition tomberait — celui-là même que la contrainte `EXCLUDE`
// écartée aurait garanti (decisions-techniques §2.3).
export async function addUnavailability(userId: string, input: AddUnavailabilityInput) {
  if (input.endsAt <= input.startsAt) {
    throw new ApiError('invalid_period', 400, 'La fin doit suivre le début.', { field: 'endsAt' })
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM unavailability WHERE user_id = ${userId} FOR UPDATE`

    const touching = await tx.unavailability.findMany({
      where: {
        userId,
        startsAt: { lte: input.endsAt },
        endsAt: { gte: input.startsAt },
      },
    })

    const [merged] = mergeIntervals([...touching, input])

    if (merged === undefined) {
      throw new ApiError('internal_error', 500, 'Fusion impossible.')
    }

    await tx.unavailability.deleteMany({ where: { id: { in: touching.map((row) => row.id) } } })

    return tx.unavailability.create({
      data: {
        userId,
        startsAt: merged.startsAt,
        endsAt: merged.endsAt,
        // Le libellé de la plage la plus longue survit à la fusion ; à défaut, celui de
        // l'ajout. Perdre les frontières d'origine est le prix assumé de la fusion.
        label: input.label ?? touching.find((row) => row.label !== null)?.label ?? null,
      },
    })
  })
}
```

> **Attention aux bornes du `findMany`.** `lte` et `gte` — et non `lt`/`gt` — parce qu'on
> veut aussi attraper les plages **adjacentes**, à fusionner. C'est le seul endroit du jalon
> où la comparaison n'est pas strictement semi-ouverte, et c'est délibéré.

- [ ] **Étapes 4 et 5 : voir passer, portes, commit.**

---

## Tâche 5 : groupes et adhésions

**Fichiers :** `api/src/modules/groups/{schema,service,routes}.ts`,
`api/src/lib/permissions.ts`, `api/src/main.ts`, `api/tests/modules/groups.test.ts`.

**Interfaces :**
- Produit : `createGroup`, `listGroups`, `getGroup`, `inviteToGroup` ;
  `canManageGroup(role)`.

- [ ] **Étape 1 : écrire le test qui échoue** — couvrir :
  - création : le créateur est administrateur du groupe
  - `GET /api/groups` ne rend que les groupes de l'appelant
  - `GET /api/groups/:id` refuse un non-membre → `403 not_a_member`
  - `POST /api/groups/:id/members` réservé à un administrateur → `403`
  - **anti-énumération** : la réponse est identique pour une adresse avec et sans compte
  - l'ajout crée une `Invitation` de `scope: 'group'`, **pas** une adhésion directe

- [ ] **Étape 3 : écrire le service.** `inviteToGroup` calque `createInvitation` de
  `events/service.ts` : recherche stricte de l'adresse, `Invitation` de `scope: 'group'`,
  courriel envoyé, réponse `{ status: 'sent' }` dans tous les cas.

- [ ] **Étape 4 : étendre l'acceptation.** Dans `invitations/service.ts`, `resolveViaLink`
  et `resolveViaInvitation` filtrent aujourd'hui sur `scope !== 'event'`. Les rendre
  polymorphes : le jeton résolu porte désormais `{ scope, targetId }`, et l'acceptation crée
  soit une participation, soit une adhésion. `previewInvitation` doit rendre un aperçu de
  groupe — nom et nombre de membres.

- [ ] **Étape 5 : portes, commit.**

```
feat(api): invite to a group through the existing invitation machinery

§5.1 lists POST /groups/:id/members, which reads like a direct insertion. Doing
that would answer differently depending on whether the address has an account,
which is the enumeration oracle §4 rules out. The polymorphic scope declared in
M1 exists for exactly this.
```

---

## Tâche 6 : calendrier partagé

**Fichiers :** `api/src/modules/groups/service.ts`, `routes.ts`,
`api/tests/modules/group-calendar.test.ts`.

**Interfaces :**
- Produit : `getGroupCalendar(userId, groupId, window)` ; route
  `GET /api/groups/:id/calendar?from=…&to=…&minimumMinutes=…`.

- [ ] **Étape 1 : écrire le test qui échoue** — couvrir :
  - la superposition de deux membres laisse le bon créneau libre
  - **le libellé n'apparaît jamais** dans la réponse : assertion sur le corps brut
  - fenêtre absente → `400`
  - fenêtre de plus de 90 jours → `400 window_too_wide`
  - non-membre → `403`
  - un membre sans aucune indisponibilité n'enlève rien

- [ ] **Étape 3 : écrire le service**

```ts
const MAXIMUM_WINDOW_DAYS = 90

// Calendrier partagé : la superposition des indisponibilités des membres sur une fenêtre
// (§2.4). **Vue calculée, jamais une table** — la matérialiser serait un cache qu'aucune
// mesure ne justifie et une source de vérité de plus à tenir à jour.
export async function getGroupCalendar(userId: string, groupId: string, window: Window) {
  const membership = await loadMembership(userId, groupId)

  if (window.to <= window.from) {
    throw new ApiError('invalid_period', 400, 'La fin de la fenêtre doit suivre son début.')
  }

  // Sans borne, un appel sur dix ans lirait toute la table.
  if (window.to.getTime() - window.from.getTime() > MAXIMUM_WINDOW_DAYS * 86_400_000) {
    throw new ApiError('window_too_wide', 400, 'La fenêtre ne peut dépasser 90 jours.', {
      maximumDays: MAXIMUM_WINDOW_DAYS,
    })
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true },
  })

  const rows = await prisma.unavailability.findMany({
    where: {
      userId: { in: members.map((member) => member.userId) },
      // Chevauchement en bornes semi-ouvertes (§2.4).
      startsAt: { lt: window.to },
      endsAt: { gt: window.from },
    },
  })

  const nameOf = new Map(members.map((member) => [member.userId, member.user.name]))

  return {
    // `label` est **privé** : le groupe voit « occupé », jamais la raison (§2.4). Il n'est
    // pas seulement omis du rendu — il ne quitte jamais cette fonction.
    busy: rows.map((row) => ({
      userId: row.userId,
      name: nameOf.get(row.userId) ?? 'Membre retiré',
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    })),
    free: freeSlots(
      { startsAt: window.from, endsAt: window.to },
      rows,
      window.minimumMinutes,
    ),
    viewer: { role: membership.role },
  }
}
```

- [ ] **Étapes 4 et 5 : voir passer, portes, commit.**

---

## Tâche 7 : front — calendrier personnel

**Fichiers :** `web/src/composables/useCalendar.ts`, `web/src/views/CalendarView.vue`,
`web/src/router.ts`, `web/tests/calendar.test.ts`.

- [ ] Route `/me/calendar`, `meta: { requiresAuth: true }`.
- [ ] Liste des indisponibilités à venir, formulaire d'ajout (deux `datetime-local` et un
      libellé facultatif), suppression.
- [ ] Un mot dans l'interface sur la fusion : « les plages qui se touchent sont réunies ».
      Sans lui, voir deux saisies devenir une ligne passe pour un bogue.
- [ ] Tests : chargement, ajout puis rechargement, état vide, erreur.

---

## Tâche 8 : front — groupes et créneaux

**Fichiers :** `web/src/composables/useGroups.ts`, `useGroup.ts`,
`web/src/views/GroupsView.vue`, `GroupView.vue`, `web/src/components/FreeSlots.vue`,
`web/src/router.ts`, `web/tests/groups.test.ts`.

- [ ] `/groups` : liste, création.
- [ ] `/groups/:id` : membres, invitation par adresse (administrateur seul), et **calendrier
      partagé** — fenêtre par défaut : les 30 prochains jours, durée minimale 2 heures.
- [ ] `FreeSlots.vue` : les créneaux libres en premier, les occupations par membre en dessous.
      C'est la réponse à la question posée, le reste est la justification.
- [ ] Un lien vers `/me/calendar` depuis la vue de groupe : la première fois, on n'a rien
      déclaré, et un calendrier vide sans porte de sortie est une impasse.
- [ ] Tests : superposition rendue, état vide, non-membre.

---

## Tâche 9 : documentation

- [ ] `journal-decisions.md` : les cinq décisions ci-dessus, avec leur coût.
- [ ] `conception.md` : §5.1 si la surface a bougé ; §2.4 si la fusion a révélé un cas non
      décrit.
- [ ] `CLAUDE.md` : état actuel — M4 terminé, M5 suivant.
- [ ] `README.md` : la démonstration « le créneau qui convient à tous ».

---

## Vérification finale du jalon

- [ ] `npx biome check .` — aucun avertissement
- [ ] `npm run typecheck`, `npm test`, `npm run build`
- [ ] `npm run db:seed`, puis démonstration à deux navigateurs :
  1. Alice crée un groupe, invite Bob et Carla
  2. Chacun déclare ses indisponibilités depuis `/me/calendar`
  3. La vue de groupe fait apparaître **les créneaux où personne n'est occupé**
  4. Une indisponibilité ajoutée par l'un rétrécit le créneau chez les autres au rechargement
- [ ] **Vérifier de ses yeux qu'aucun libellé privé n'apparaît** dans le calendrier partagé,
      ni à l'écran ni dans la réponse réseau.
