# Membres d'un groupe, retrait et blocage d'amis — plan d'implémentation

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** un groupe se renomme, se quitte, et ses admins gèrent ses membres ; une amitié se
retire, une personne se bloque.

**Architecture :** partie A dans `groups/` — une fonction de départ unique, sous le verrou
`lockGroup` déjà posé par les événements de groupe. Partie B dans `friends/` — une table
`user_blocks` consultée par `requestFriendship`, qui reste silencieuse.

**Pile :** Hono, Prisma 7, Zod 4, Vue 3, Vitest.

**Spec :** [`2026-09-28-membres-et-amis-conception.md`](2026-09-28-membres-et-amis-conception.md).

## Contraintes globales

- Partie A sur `feat/group-members`, tirée de `feature` ; elle porte aussi la spec et ce
  plan. Partie B sur `feat/friend-removal`, tirée de `feat/group-members` une fois A
  terminée — les deux touchent `docs/journal-decisions.md` et `conception.md`.
- Aucune dépendance nouvelle. Une migration, en B, écrite à la main ; appliquer depuis
  `api/` : `npx prisma migrate deploy`, `npm run db:generate`, `npx prisma migrate status`.
- Portes avant chaque commit, chacune seule : `npx biome check --write .`,
  `npm run typecheck`, `npm test`. Biome ne corrige jamais un `.vue`.
- Commits Conventional Commits en anglais, sans ligne d'attribution. Interface et messages
  en français.

## Review Focus

- **Deux admins qui partent en même temps** : il doit rester un admin. Test en tâche A2.
- **Un admin retire le dernier autre admin puis part** : promotion du plus ancien. Tâche A2.
- **Bloqué qui insiste** : même réponse que d'habitude, aucune notification. Tâche B2.
- **Blocage croisé** (chacun bloque l'autre) : débloquer d'un côté ne rétablit pas les
  demandes de l'autre. Tâche B2.
- **Retrait par un admin d'un membre qui n'existe pas** : 404, pas 500. Tâche A2.

---

### Tâche A1 : renommer, promouvoir, rétrograder

**Fichiers :** `api/src/modules/groups/{schema,service,routes}.ts`,
`api/tests/modules/group-admin.test.ts` (nouveau).

**Produit :** `renameGroup(userId, groupId, { name })`, `setMemberRole(userId, groupId,
targetId, { role })`, schémas `renameGroupSchema`, `memberRoleSchema`. Helper interne
`loadAdminMembership(userId, groupId)` : `loadMembership` puis 403 `forbidden` si non-admin.

- [ ] **Étape 1 : tests rouges**

```ts
// api/tests/modules/group-admin.test.ts
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

async function addMember(groupId: string, headers: Headers, role: 'admin' | 'member' = 'member') {
  await prisma.groupMember.create({ data: { groupId, userId: await userId(headers), role } })
}

const roleOf = async (groupId: string, headers: Headers) =>
  (
    await prisma.groupMember.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId: await userId(headers) } },
    })
  ).role

it('laisse un admin renommer le groupe', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await send('PATCH', `/api/groups/${groupId}`, alice, { name: 'La coloc' })

  expect(response.status).toBe(200)
  expect((await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).name).toBe('La coloc')
})

it('refuse le renommage à un simple membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)

  const response = await send('PATCH', `/api/groups/${groupId}`, bob, { name: 'X' })

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'forbidden' })
})

it('refuse un nom vide', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  expect((await send('PATCH', `/api/groups/${groupId}`, alice, { name: '  ' })).status).toBe(400)
})

it('promeut puis rétrograde un membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  const path = `/api/groups/${groupId}/members/${await userId(bob)}`

  expect((await send('PATCH', path, alice, { role: 'admin' })).status).toBe(200)
  expect(await roleOf(groupId, bob)).toBe('admin')

  expect((await send('PATCH', path, alice, { role: 'member' })).status).toBe(200)
  expect(await roleOf(groupId, bob)).toBe('member')
})

it('refuse de rétrograder le dernier admin', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await send(
    'PATCH',
    `/api/groups/${groupId}/members/${await userId(alice)}`,
    alice,
    { role: 'member' },
  )

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'last_admin' })
})

it('refuse le changement de rôle à un simple membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)

  const response = await send(
    'PATCH',
    `/api/groups/${groupId}/members/${await userId(bob)}`,
    bob,
    { role: 'admin' },
  )

  expect(response.status).toBe(403)
})

it('rend 404 sur une cible qui n’est pas membre', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await send('PATCH', `/api/groups/${groupId}/members/inconnu`, alice, {
    role: 'admin',
  })

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'member_not_found' })
})
```

- [ ] **Étape 2 :** `npm test --workspace api -- group-admin` — attendu : ÉCHEC (404 de route).

- [ ] **Étape 3 : schémas** (`groups/schema.ts`)

```ts
// Renommer : même règle que créer, pour qu'un nom accepté une fois le soit toujours.
export const renameGroupSchema = createGroupSchema

export const memberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
})

export type MemberRoleInput = z.infer<typeof memberRoleSchema>
```

- [ ] **Étape 4 : service** (`groups/service.ts`, importer `lockGroup` depuis `./enrollment.ts`)

```ts
async function loadAdminMembership(userId: string, groupId: string) {
  const membership = await loadMembership(userId, groupId)

  if (!canManageGroup(membership.role)) {
    throw new ApiError('forbidden', 403, 'Seul un administrateur du groupe peut faire cela.')
  }

  return membership
}

export async function renameGroup(userId: string, groupId: string, input: CreateGroupInput) {
  await loadAdminMembership(userId, groupId)
  await prisma.group.update({ where: { id: groupId }, data: { name: input.name } })
  return { ok: true as const }
}

// Sous verrou : deux admins qui se rétrogradent l'un l'autre au même instant liraient
// chacun « il reste un autre admin », et le groupe finirait sans aucun.
export async function setMemberRole(
  userId: string,
  groupId: string,
  targetId: string,
  input: MemberRoleInput,
) {
  await loadAdminMembership(userId, groupId)

  await prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId)

    const target = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetId } },
    })

    if (target === null) {
      throw new ApiError('member_not_found', 404, "Cette personne n'est pas membre du groupe.")
    }

    if (target.role === 'admin' && input.role === 'member') {
      const admins = await tx.groupMember.count({ where: { groupId, role: 'admin' } })

      if (admins === 1) {
        throw new ApiError('last_admin', 409, 'Le groupe doit garder au moins un administrateur.')
      }
    }

    await tx.groupMember.update({
      where: { groupId_userId: { groupId, userId: targetId } },
      data: { role: input.role },
    })
  })

  return { ok: true as const }
}
```

- [ ] **Étape 5 : routes** (`groups/routes.ts`)

```ts
  .patch('/:id', jsonBody(renameGroupSchema), async (c) => {
    return c.json(await renameGroup(c.get('user').id, c.req.param('id'), c.req.valid('json')))
  })
  .patch('/:id/members/:userId', jsonBody(memberRoleSchema), async (c) => {
    const { id, userId } = c.req.param()
    return c.json(await setMemberRole(c.get('user').id, id, userId, c.req.valid('json')))
  })
```

- [ ] **Étape 6 :** `npm test --workspace api -- group-admin` — attendu : 7 PASS.
- [ ] **Étape 7 : portes, commit** `feat(api): let group admins rename the group and manage roles`

---

### Tâche A2 : quitter, retirer, promotion et suppression automatiques

**Fichiers :** `groups/{service,routes}.ts`, `group-admin.test.ts` (ajouts).

**Produit :** `removeMember(userId, groupId, targetId): Promise<{ groupDeleted: boolean }>`.
`getGroup` rend `viewer: { userId, role }`.

- [ ] **Étape 1 : tests rouges**

```ts
const leave = async (groupId: string, headers: Headers) =>
  send('DELETE', `/api/groups/${groupId}/members/${await userId(headers)}`, headers)

it('laisse un membre quitter le groupe', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)

  const response = await leave(groupId, bob)

  expect(await response.json()).toEqual({ groupDeleted: false })
  expect(await prisma.groupMember.count({ where: { groupId } })).toBe(1)
})

it('laisse un admin retirer un membre, pas un membre retirer un autre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  await addMember(groupId, carla)

  const byMember = await send('DELETE', `/api/groups/${groupId}/members/${await userId(carla)}`, bob)
  expect(byMember.status).toBe(403)

  const byAdmin = await send('DELETE', `/api/groups/${groupId}/members/${await userId(carla)}`, alice)
  expect(byAdmin.status).toBe(200)
  expect(await prisma.groupMember.count({ where: { groupId } })).toBe(2)
})

it('rend 404 au retrait de quelqu’un qui n’est pas membre', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await send('DELETE', `/api/groups/${groupId}/members/inconnu`, alice)

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'member_not_found' })
})

it('promeut le membre le plus ancien quand le dernier admin part', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  await addMember(groupId, carla)

  await leave(groupId, alice)

  expect(await roleOf(groupId, bob)).toBe('admin')
  expect(await roleOf(groupId, carla)).toBe('member')
})

it('supprime le groupe au départ du dernier membre, sans toucher ses sorties', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)
  const created = await send('POST', '/api/events', alice, {
    title: 'Raclette',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 90_000_000).toISOString(),
    groupId,
  })
  const eventId = ((await created.json()) as { id: string }).id

  const response = await leave(groupId, alice)

  expect(await response.json()).toEqual({ groupDeleted: true })
  expect(await prisma.group.count({ where: { id: groupId } })).toBe(0)
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  expect(event.groupId).toBeNull()
  expect(await prisma.eventParticipant.count({ where: { eventId } })).toBe(1)
})

it('laisse intactes les participations de qui part', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  await send('POST', '/api/events', alice, {
    title: 'Raclette',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 90_000_000).toISOString(),
    groupId,
  })

  await leave(groupId, bob)

  expect(await prisma.eventParticipant.count({ where: { userId: await userId(bob) } })).toBe(1)
})

it('garde un admin quand deux admins partent en même temps', async () => {
  for (let round = 0; round < 5; round += 1) {
    const alice = await signIn(`alice-${round}@example.test`)
    const bob = await signIn(`bob-${round}@example.test`)
    const carla = await signIn(`carla-${round}@example.test`)
    const groupId = await makeGroup(alice)
    await addMember(groupId, bob, 'admin')
    await addMember(groupId, carla)

    await Promise.all([leave(groupId, alice), leave(groupId, bob)])

    expect(await roleOf(groupId, carla)).toBe('admin')
  }
})

it("dit à l'appelant qui il est dans la fiche du groupe", async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const { group } = (await (await app.request(`/api/groups/${groupId}`, { headers: alice })).json()) as {
    group: { viewer: { userId: string; role: string } }
  }

  expect(group.viewer).toEqual({ userId: await userId(alice), role: 'admin' })
})
```

- [ ] **Étape 2 :** `npm test --workspace api -- group-admin` — attendu : ÉCHEC sur les 8 nouveaux.

- [ ] **Étape 3 : service**

```ts
// Quitter et retirer sont un même geste vu de deux côtés (spec « membres et amis »). Sous
// verrou : deux admins qui partent ensemble liraient chacun « il reste un admin ».
//
// Aucun état absorbant (§3.1) : un groupe sans admin ne se gère plus, un groupe sans
// membre ne se voit plus. Le premier promeut le plus ancien, le second disparaît — ses
// sorties restent, détachées (`ON DELETE SET NULL`).
export async function removeMember(userId: string, groupId: string, targetId: string) {
  const membership = await loadMembership(userId, groupId)
  const leaving = targetId === userId

  if (!leaving && !canManageGroup(membership.role)) {
    throw new ApiError('forbidden', 403, 'Seul un administrateur du groupe peut retirer un membre.')
  }

  return prisma.$transaction(async (tx) => {
    await lockGroup(tx, groupId)

    const removed = await tx.groupMember.deleteMany({ where: { groupId, userId: targetId } })

    if (removed.count === 0) {
      throw new ApiError('member_not_found', 404, "Cette personne n'est pas membre du groupe.")
    }

    const remaining = await tx.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: 'asc' },
    })

    if (remaining.length === 0) {
      await tx.group.delete({ where: { id: groupId } })
      return { groupDeleted: true }
    }

    if (!remaining.some((member) => member.role === 'admin')) {
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId: remaining[0].userId } },
        data: { role: 'admin' },
      })
    }

    return { groupDeleted: false }
  })
}
```

Dans `getGroup`, remplacer `viewer: { role: membership.role }` par
`viewer: { userId, role: membership.role }`.

- [ ] **Étape 4 : route**

```ts
  .delete('/:id/members/:userId', async (c) => {
    const { id, userId } = c.req.param()
    return c.json(await removeMember(c.get('user').id, id, userId))
  })
```

- [ ] **Étape 5 :** `npm test --workspace api -- group` — attendu : tout PASS. Puis retirer
  temporairement `await lockGroup(tx, groupId)` de `removeMember`, relancer trois fois
  `-t "en même temps"`, noter le résultat, restaurer. Si le test ne tombe jamais sans verrou,
  le consigner plutôt que le présenter comme preuve.
- [ ] **Étape 6 : portes, commit** `feat(api): let members leave a group and admins remove them`

---

### Tâche A3 : interface de la fiche du groupe

**Fichiers :** `web/src/composables/useGroup.ts`, `web/src/views/GroupView.vue`.

- [ ] **Étape 1 : composable** — `GroupDetail.viewer` devient `{ userId: string; role: 'admin' | 'member' }`.
  Ajouter à `useGroup` et à son retour :

```ts
  async function rename(name: string): Promise<void> {
    await apiFetch(`/api/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify({ name }) })
    await reload()
  }

  async function setRole(userId: string, role: 'admin' | 'member'): Promise<void> {
    await apiFetch(`/api/groups/${groupId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
    await reload()
  }

  // Rend `groupDeleted` : la vue en déduit où renvoyer, sans relire un groupe disparu.
  async function removeMember(userId: string): Promise<{ groupDeleted: boolean }> {
    return apiFetch<{ groupDeleted: boolean }>(`/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
    })
  }
```

- [ ] **Étape 2 : vue** — dans le script : `useRouter`, un `actionError` affiché sous les
  membres, un état `renaming` + `draftName`, et :

```ts
const router = useRouter()
const actionError = ref('')
const renaming = ref(false)
const draftName = ref('')

async function run(action: () => Promise<unknown>): Promise<void> {
  actionError.value = ''
  try {
    await action()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : "L'action a échoué."
  }
}

function startRename(): void {
  draftName.value = group.value?.name ?? ''
  renaming.value = true
}

async function submitRename(): Promise<void> {
  await run(async () => {
    await rename(draftName.value)
    renaming.value = false
  })
}

async function removeOther(userId: string, name: string): Promise<void> {
  if (!window.confirm(`Retirer ${name} du groupe ?`)) return
  await run(async () => {
    await removeMember(userId)
    await reload()
  })
}

// Quitter renvoie à la liste : le groupe n'est plus lisible, qu'il existe encore ou non.
async function leaveGroup(): Promise<void> {
  if (!window.confirm('Quitter ce groupe ? Vos sorties restent inchangées.')) return
  await run(async () => {
    if (group.value) await removeMember(group.value.viewer.userId)
    await router.push('/groups')
  })
}
```

  Gabarit :
  - En-tête, admin : bouton « Renommer » (`startRename`) ; quand `renaming`, un formulaire en
    place (champ `draftName`, `maxlength="120"`, « Enregistrer », « Annuler »).
  - Chaque membre autre que `group.viewer.userId`, si `group.viewer.role === 'admin'` : bouton
    « Promouvoir » (`setRole(member.userId, 'admin')`) ou « Rétrograder »
    (`setRole(member.userId, 'member')`) selon son rôle, via `run`, et « Retirer »
    (`removeOther`). Boutons secondaires `h-9`, bordure `border-field`, texte `text-[13px]`.
  - Sous les membres : `<p v-if="actionError" class="text-sm text-fail-ink">`.
  - En bas de page, pour tous : bouton texte « Quitter le groupe », `text-fail-ink`.

- [ ] **Étape 3 : portes** (vérifier `git status` : aucun `.vue` modifié par Biome) **et vérification
  à l'écran** : `npm run db:seed`, puis en Alice sur La coloc : renommer ; promouvoir Bob ;
  rétrograder Bob ; retirer Carla ; quitter (Bob devient admin — vérifier en Bob).
- [ ] **Étape 4 : commit** `feat(web): manage a group's name and members from its page`

---

### Tâche A4 : documentation de la partie A

- [ ] `conception.md` §2.3 : sous le bloc SQL, les règles — un admin renomme et gère les rôles ;
  on ne rétrograde pas le dernier admin ; un départ promeut le plus ancien s'il ne reste aucun
  admin, supprime le groupe s'il ne reste personne ; les participations restent.
  §5.1 : `PATCH /groups/:id`, `PATCH|DELETE /groups/:id/members/:userId`.
- [ ] `journal-decisions.md` : section « Membres d'un groupe » avec les décisions de la spec et
  leur coût si erroné ; retirer le point ouvert « Un groupe ne se quitte pas… ».
- [ ] Portes, commit `docs: record group membership rules`.

---

### Tâche B1 : table `user_blocks`

Brancher d'abord : `git switch -c feat/friend-removal` depuis `feat/group-members`.

**Fichiers :** `api/prisma/schema.prisma`, migration `20260928100000_user_blocks`,
`api/tests/helpers/db.ts`, `api/tests/schema-user-blocks.test.ts` (nouveau).

- [ ] **Étape 1 : tests rouges**

```ts
// api/tests/schema-user-blocks.test.ts
import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeUser(email: string) {
  return prisma.user.create({ data: { id: `u-${email}`, name: email, email } })
}

it('enregistre un blocage', async () => {
  const alice = await makeUser('alice@example.test')
  const bob = await makeUser('bob@example.test')

  await prisma.userBlock.create({ data: { blockerId: alice.id, blockedId: bob.id } })

  expect(await prisma.userBlock.count()).toBe(1)
})

it('refuse de se bloquer soi-même', async () => {
  const alice = await makeUser('alice@example.test')

  await expect(
    prisma.userBlock.create({ data: { blockerId: alice.id, blockedId: alice.id } }),
  ).rejects.toThrow()
})

it('refuse un blocage en double', async () => {
  const alice = await makeUser('alice@example.test')
  const bob = await makeUser('bob@example.test')
  await prisma.userBlock.create({ data: { blockerId: alice.id, blockedId: bob.id } })

  await expect(
    prisma.userBlock.create({ data: { blockerId: alice.id, blockedId: bob.id } }),
  ).rejects.toThrow()
})
```

- [ ] **Étape 2 :** `npm test --workspace api -- schema-user-blocks` — attendu : ÉCHEC (`userBlock` inconnu).
- [ ] **Étape 3 : schéma** — après `model Friendship` :

```prisma
// Blocage (spec « membres et amis »). Orienté : bloquer n'est pas réciproque. Sa seule
// portée est la demande d'ami, ignorée en silence dans les deux sens.
model UserBlock {
  blockerId String   @map("blocker_id")
  blocker   User     @relation("BlockGiven", fields: [blockerId], references: [id], onDelete: Cascade)
  blockedId String   @map("blocked_id")
  blocked   User     @relation("BlockReceived", fields: [blockedId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")

  @@id([blockerId, blockedId])
  @@index([blockedId])
  @@map("user_blocks")
}
```

  Dans `model User` : `blocksGiven UserBlock[] @relation("BlockGiven")` et
  `blocksReceived UserBlock[] @relation("BlockReceived")`.

- [ ] **Étape 4 : migration**

```sql
-- Blocage d'un utilisateur par un autre (spec « membres et amis »). Le CHECK ne vit qu'ici :
-- Prisma ne modélise pas les contraintes de ce genre.
-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id"),
    CONSTRAINT "user_blocks_distinct" CHECK ("blocker_id" <> "blocked_id")
);

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Étape 5 :** `TABLES` de `api/tests/helpers/db.ts` gagne `'user_blocks'` en tête. Appliquer
  depuis `api/` (deploy, generate, status « up to date »).
- [ ] **Étape 6 :** tests — attendu : 3 PASS. Portes, commit `feat(api): store user blocks`.

---

### Tâche B2 : retirer un ami, bloquer, débloquer

**Fichiers :** `friends/{service,routes}.ts`, `api/tests/modules/friend-blocks.test.ts` (nouveau).

**Produit :** `removeFriend(userId, friendId)`, `blockUser(userId, targetId)`,
`unblockUser(userId, targetId)` ; `listFriends` rend `blocked`.

- [ ] **Étape 1 : tests rouges** — reprendre `send`, `userId`, `ask`, `listFriends` et le
  `afterEach(vi.restoreAllMocks)` de `friends.test.ts`, plus :

```ts
async function befriend(a: Headers, b: Headers, bEmail: string, aEmail: string) {
  await ask(a, bEmail)
  await ask(b, aEmail)
}

it('retire un ami, dans les deux listes', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await befriend(alice, bob, 'bob@example.test', 'alice@example.test')

  const response = await send('DELETE', `/api/friends/${await userId(bob)}`, alice)

  expect(response.status).toBe(200)
  expect((await listFriends(alice)).friends).toEqual([])
  expect((await listFriends(bob)).friends).toEqual([])
})

it('rend 404 quand on retire quelqu’un qui n’est pas ami', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')

  const response = await send('DELETE', `/api/friends/${await userId(bob)}`, alice)

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'friendship_not_found' })
})

it('permet de redemander après un retrait', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await befriend(alice, bob, 'bob@example.test', 'alice@example.test')
  await send('DELETE', `/api/friends/${await userId(bob)}`, alice)

  await ask(alice, 'bob@example.test')

  expect((await listFriends(bob)).received).toHaveLength(1)
})

it('bloquer supprime l’amitié et les demandes des deux sens', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  await befriend(alice, bob, 'bob@example.test', 'alice@example.test')
  await ask(carla, 'alice@example.test')

  await send('POST', `/api/friends/blocks/${await userId(bob)}`, alice)
  await send('POST', `/api/friends/blocks/${await userId(carla)}`, alice)

  const mine = await listFriends(alice)
  expect(mine.friends).toEqual([])
  expect(mine.received).toEqual([])
  expect(mine.blocked.map((entry) => entry.userId).sort()).toEqual(
    [await userId(bob), await userId(carla)].sort(),
  )
})

it('ignore en silence les demandes d’un bloqué, sans notifier', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await send('POST', `/api/friends/blocks/${await userId(bob)}`, alice)

  const response = await ask(bob, 'alice@example.test')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'sent' })
  expect((await listFriends(alice)).received).toEqual([])
  expect(await prisma.notification.count({ where: { type: 'friend.request' } })).toBe(0)
})

it('ignore aussi les demandes du bloqueur vers le bloqué', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await send('POST', `/api/friends/blocks/${await userId(bob)}`, alice)

  await ask(alice, 'bob@example.test')

  expect((await listFriends(bob)).received).toEqual([])
})

it('rétablit les demandes après déblocage, sauf blocage de l’autre côté', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await send('POST', `/api/friends/blocks/${await userId(bob)}`, alice)
  await send('POST', `/api/friends/blocks/${await userId(alice)}`, bob)

  await send('DELETE', `/api/friends/blocks/${await userId(bob)}`, alice)
  await ask(alice, 'bob@example.test')
  expect((await listFriends(bob)).received).toEqual([])

  await send('DELETE', `/api/friends/blocks/${await userId(alice)}`, bob)
  await ask(alice, 'bob@example.test')
  expect((await listFriends(bob)).received).toHaveLength(1)
})

it('bloque et débloque de façon idempotente', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const path = `/api/friends/blocks/${await userId(bob)}`

  expect((await send('POST', path, alice)).status).toBe(200)
  expect((await send('POST', path, alice)).status).toBe(200)
  expect(await prisma.userBlock.count()).toBe(1)
  expect((await send('DELETE', path, alice)).status).toBe(200)
  expect((await send('DELETE', path, alice)).status).toBe(200)
  expect(await prisma.userBlock.count()).toBe(0)
})

it('refuse de se bloquer soi-même et un identifiant inconnu', async () => {
  const alice = await signIn('alice@example.test')

  const self = await send('POST', `/api/friends/blocks/${await userId(alice)}`, alice)
  expect(self.status).toBe(400)
  expect(await self.json()).toMatchObject({ code: 'self_block' })

  const unknown = await send('POST', '/api/friends/blocks/inconnu', alice)
  expect(unknown.status).toBe(404)
  expect(await unknown.json()).toMatchObject({ code: 'user_not_found' })
})
```

  Le type `Friends` du fichier gagne `blocked: { userId: string; name: string }[]`.

- [ ] **Étape 2 :** `npm test --workspace api -- friend-blocks` — attendu : ÉCHEC.

- [ ] **Étape 3 : service** (`friends/service.ts`)

```ts
// Un blocage, dans un sens ou dans l'autre, rend toute demande entre deux personnes
// silencieuse : même réponse, rien d'écrit, personne de notifié. Le bloqué ne doit pas
// pouvoir déduire qu'il l'est.
async function blockedEitherWay(first: string, second: string): Promise<boolean> {
  const count = await prisma.userBlock.count({
    where: {
      OR: [
        { blockerId: first, blockedId: second },
        { blockerId: second, blockedId: first },
      ],
    },
  })
  return count > 0
}

export async function removeFriend(userId: string, friendId: string) {
  if (userId === friendId) {
    throw new ApiError('friendship_not_found', 404, 'Amitié introuvable.')
  }

  const removed = await prisma.friendship.deleteMany({ where: normalisePair(userId, friendId) })

  if (removed.count === 0) {
    throw new ApiError('friendship_not_found', 404, 'Amitié introuvable.')
  }

  return { ok: true as const }
}

export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) {
    throw new ApiError('self_block', 400, 'On ne se bloque pas soi-même.')
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })

  if (target === null) {
    throw new ApiError('user_not_found', 404, 'Utilisateur introuvable.')
  }

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
      create: { blockerId: userId, blockedId: targetId },
      update: {},
    }),
    prisma.friendship.deleteMany({ where: normalisePair(userId, targetId) }),
    prisma.friendRequest.deleteMany({
      where: {
        status: 'pending',
        OR: [
          { fromUserId: userId, toUserId: targetId },
          { fromUserId: targetId, toUserId: userId },
        ],
      },
    }),
  ])

  return { ok: true as const }
}

export async function unblockUser(userId: string, targetId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } })
  return { ok: true as const }
}
```

  Dans `requestFriendship`, juste après `const target = …` et son bloc `if (target === null)` :

```ts
  if (await blockedEitherWay(userId, target.id)) {
    return SAME_ANSWER
  }
```

  Dans `listFriends`, ajouter au `Promise.all` :

```ts
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: { blocked: true },
      orderBy: { createdAt: 'desc' },
    }),
```

  et au retour : `blocked: blocks.map((block) => ({ userId: block.blockedId, name: block.blocked.name })),`.

- [ ] **Étape 4 : routes** — `/blocks/:userId` **avant** `/:userId` :

```ts
  .post('/blocks/:userId', async (c) => {
    return c.json(await blockUser(c.get('user').id, c.req.param('userId')))
  })
  .delete('/blocks/:userId', async (c) => {
    return c.json(await unblockUser(c.get('user').id, c.req.param('userId')))
  })
  .delete('/:userId', async (c) => {
    return c.json(await removeFriend(c.get('user').id, c.req.param('userId')))
  })
```

- [ ] **Étape 5 :** `npm test --workspace api -- friend` — attendu : tout PASS (anciens compris).
- [ ] **Étape 6 : portes, commit** `feat(api): let people remove a friend and block someone`

---

### Tâche B3 : interface Amis

**Fichiers :** `web/src/composables/useFriends.ts`, `web/src/views/FriendsView.vue`.

- [ ] **Étape 1 : composable** — type `BlockedUser = { userId: string; name: string }`,
  `blocked` dans `FriendsBody`, un `ref<BlockedUser[]>`, rempli par `reload`, et :

```ts
  async function remove(friendId: string): Promise<void> {
    await apiFetch(`/api/friends/${friendId}`, { method: 'DELETE' })
    await reload()
  }

  async function block(targetId: string): Promise<void> {
    await apiFetch(`/api/friends/blocks/${targetId}`, { method: 'POST' })
    await reload()
  }

  async function unblock(targetId: string): Promise<void> {
    await apiFetch(`/api/friends/blocks/${targetId}`, { method: 'DELETE' })
    await reload()
  }
```

- [ ] **Étape 2 : vue**
  - Chaque ami : à droite, « Retirer » et « Bloquer », boutons secondaires `h-9`, chacun
    derrière `window.confirm` (« Retirer X de vos amis ? », « Bloquer X ? Ses demandes seront
    ignorées. »).
  - Chaque demande reçue : « Bloquer » à côté du refus, même confirmation.
  - Section « Bloqués » (`v-if="blocked.length > 0"`) après « Demandes envoyées » : nom et
    « Débloquer ».
  - Un `actionError` affiché sous la liste d'amis, alimenté par un `run(action)` identique à
    celui de `GroupView`.
- [ ] **Étape 3 : portes et vérification à l'écran** — `npm run db:seed` ; en Alice : retirer Bob,
  le redemander ; bloquer Carla depuis sa demande reçue ; la débloquer.
- [ ] **Étape 4 : commit** `feat(web): remove or block a friend from the friends page`

---

### Tâche B4 : documentation de la partie B

- [ ] `conception.md` §2.2 : la table `user_blocks` et ses règles ; §5.1 : `DELETE /friends/:userId`,
  `POST|DELETE /friends/blocks/:userId`.
- [ ] `journal-decisions.md` : section « Amis — retirer et bloquer » ; retirer le point ouvert
  « Aucun moyen de retirer un ami ni de bloquer quelqu'un » ; ajouter en point ouvert « un
  blocage n'empêche pas les invitations de groupe ou de sortie ».
- [ ] `CLAUDE.md` : rien — `TABLES` est déjà décrit comme à étendre.
- [ ] Portes, commit `docs: record friend removal and blocking`.
