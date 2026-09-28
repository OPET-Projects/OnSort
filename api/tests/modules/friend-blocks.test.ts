import { afterEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

// `signIn` lit le lien magique dans la sortie de `console.info` : une doublure laissée en
// place par un test précédent l'aveuglerait.
afterEach(() => {
  vi.restoreAllMocks()
})

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

const ask = (headers: Headers, email: string) =>
  send('POST', '/api/friends/requests', headers, { email })

type Friends = {
  friends: { userId: string; name: string }[]
  received: { id: string; from: { userId: string; name: string } }[]
  sent: { id: string; to: { name: string } }[]
  blocked: { userId: string; name: string }[]
}

const listFriends = async (headers: Headers): Promise<Friends> =>
  (await (await app.request('/api/friends', { headers })).json()) as Friends

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
