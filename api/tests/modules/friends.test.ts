import { afterEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

// `signIn` lit le lien magique dans la sortie de `console.info` : une doublure laissée en
// place par un test précédent l'aveuglerait, et l'échec apparaîtrait dans un autre test que
// celui qui l'a causé.
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
}

const listFriends = async (headers: Headers): Promise<Friends> =>
  (await (await app.request('/api/friends', { headers })).json()) as Friends

it('refuse sans session', async () => {
  expect((await app.request('/api/friends')).status).toBe(401)
})

it('crée une demande et notifie le destinataire', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')

  const response = await ask(alice, 'bob@example.test')

  expect(response.status).toBe(200)

  const request = await prisma.friendRequest.findFirstOrThrow()
  expect(request.status).toBe('pending')

  const notification = await prisma.notification.findFirstOrThrow({
    where: { userId: await userId(bob) },
  })
  expect(notification.type).toBe('friend.request')
})

// Règle anti-énumération de §4 : la réponse ne doit rien dire de l'existence du compte.
it('répond à l’identique pour une adresse inconnue', async () => {
  const alice = await signIn('alice@example.test')
  await signIn('bob@example.test')
  vi.spyOn(console, 'info').mockImplementation(() => {})

  const known = await ask(alice, 'bob@example.test')
  const unknown = await ask(alice, 'personne@example.test')

  expect(unknown.status).toBe(known.status)
  expect(await unknown.json()).toEqual(await known.json())
})

it('refuse une demande à soi-même', async () => {
  const alice = await signIn('alice@example.test')

  const response = await ask(alice, 'alice@example.test')

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'self_friend_request' })
})

// Redemander ne doit pas révéler que la première demande existe : même réponse que la
// première fois, et une seule ligne en base.
it('reste silencieux sur une demande répétée', async () => {
  const alice = await signIn('alice@example.test')
  await signIn('bob@example.test')

  const first = await ask(alice, 'bob@example.test')
  const second = await ask(alice, 'bob@example.test')

  expect(second.status).toBe(first.status)
  expect(await second.json()).toEqual(await first.json())
  expect(await prisma.friendRequest.count()).toBe(1)
})

// Deux personnes qui se demandent mutuellement veulent la même chose : refuser pour cause
// de doublon serait absurde.
it('accepte la première demande quand la seconde la croise', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')

  await ask(alice, 'bob@example.test')
  await ask(bob, 'alice@example.test')

  const request = await prisma.friendRequest.findFirstOrThrow({
    where: { fromUserId: await userId(alice) },
  })
  expect(request.status).toBe('accepted')
  expect(await prisma.friendship.count()).toBe(1)
})

it('crée une amitié normalisée à l’acceptation', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await ask(alice, 'bob@example.test')
  const request = await prisma.friendRequest.findFirstOrThrow()

  const response = await send('POST', `/api/friends/requests/${request.id}/accept`, bob)

  expect(response.status).toBe(200)

  const friendship = await prisma.friendship.findFirstOrThrow()
  expect(friendship.userAId < friendship.userBId).toBe(true)

  const notification = await prisma.notification.findFirstOrThrow({
    where: { userId: await userId(alice), type: 'friend.accepted' },
  })
  expect(notification.type).toBe('friend.accepted')
})

it('refuse sans créer d’amitié', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await ask(alice, 'bob@example.test')
  const request = await prisma.friendRequest.findFirstOrThrow()

  expect((await send('POST', `/api/friends/requests/${request.id}/decline`, bob)).status).toBe(200)

  expect(await prisma.friendship.count()).toBe(0)
  expect((await prisma.friendRequest.findFirstOrThrow()).status).toBe('declined')
})

// 404 et non 403 : répondre « interdit » confirmerait que cette demande existe.
it('rend 404 sur la demande d’un autre', async () => {
  const alice = await signIn('alice@example.test')
  await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  await ask(alice, 'bob@example.test')
  const request = await prisma.friendRequest.findFirstOrThrow()

  const response = await send('POST', `/api/friends/requests/${request.id}/accept`, carla)

  expect(response.status).toBe(404)
  expect(await prisma.friendship.count()).toBe(0)
})

it('rend les amis et les demandes en attente', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')

  await ask(alice, 'bob@example.test')
  const request = await prisma.friendRequest.findFirstOrThrow()
  await send('POST', `/api/friends/requests/${request.id}/accept`, bob)
  await ask(carla, 'alice@example.test')

  const body = await listFriends(alice)

  expect(body.friends).toHaveLength(1)
  expect(body.friends[0]?.name).toBeTruthy()
  expect(body.received).toHaveLength(1)
  expect(body.received[0]?.from.userId).toBe(await userId(carla))
})

it('ne montre pas les amitiés des autres', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  await ask(alice, 'bob@example.test')
  const request = await prisma.friendRequest.findFirstOrThrow()
  await send('POST', `/api/friends/requests/${request.id}/accept`, bob)

  expect((await listFriends(carla)).friends).toEqual([])
})

// Une demande refusée puis renouvelée doit pouvoir aboutir : aucun état n'est absorbant.
it('rouvre une demande précédemment refusée', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await ask(alice, 'bob@example.test')
  const first = await prisma.friendRequest.findFirstOrThrow()
  await send('POST', `/api/friends/requests/${first.id}/decline`, bob)

  await ask(alice, 'bob@example.test')

  const again = await prisma.friendRequest.findFirstOrThrow()
  expect(again.status).toBe('pending')
})
