import { afterEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { notify } from '../../src/lib/notify.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

async function userId(headers: Headers): Promise<string> {
  const me = await app.request('/api/me', { headers })
  return ((await me.json()) as { user: { id: string } }).user.id
}

type Feed = {
  notifications: { id: string; type: string; readAt: string | null }[]
  unread: number
}

const feed = async (headers: Headers, query = ''): Promise<Feed> =>
  (await (await app.request(`/api/notifications${query}`, { headers })).json()) as Feed

it('refuse sans session', async () => {
  expect((await app.request('/api/notifications')).status).toBe(401)
})

it('rend ses notifications et le nombre de non-lues', async () => {
  const alice = await signIn('alice@example.test')
  const id = await userId(alice)
  await notify({ userIds: [id], type: 'friend.request', payload: { name: 'Bob' } })
  await notify({ userIds: [id], type: 'expense.created' })

  const body = await feed(alice)

  expect(body.notifications).toHaveLength(2)
  expect(body.unread).toBe(2)
})

it('ne rend que les siennes', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await notify({ userIds: [await userId(bob)], type: 'friend.request' })

  expect((await feed(alice)).notifications).toEqual([])
})

// Les plus récentes d'abord : une liste chronologique enterrerait ce qui vient d'arriver.
// Les dates sont posées explicitement, `created_at` ayant une résolution d'une milliseconde
// que deux écritures consécutives ne franchissent pas toujours.
it('rend les plus récentes en premier', async () => {
  const alice = await signIn('alice@example.test')
  const id = await userId(alice)
  await prisma.notification.createMany({
    data: [
      { userId: id, type: 'friend.request', createdAt: new Date('2026-10-01T10:00:00Z') },
      { userId: id, type: 'friend.accepted', createdAt: new Date('2026-10-01T11:00:00Z') },
    ],
  })

  expect((await feed(alice)).notifications[0]?.type).toBe('friend.accepted')
})

// Une liste qui se réordonne toute seule entre deux chargements passe pour un bogue.
it('garde le même ordre quand les dates sont identiques', async () => {
  const alice = await signIn('alice@example.test')
  const id = await userId(alice)
  const createdAt = new Date('2026-10-01T10:00:00Z')
  await prisma.notification.createMany({
    data: [
      { userId: id, type: 'friend.request', createdAt },
      { userId: id, type: 'friend.accepted', createdAt },
      { userId: id, type: 'expense.created', createdAt },
    ],
  })

  const first = (await feed(alice)).notifications.map((row) => row.id)
  const second = (await feed(alice)).notifications.map((row) => row.id)

  expect(second).toEqual(first)
})

it('marque une notification comme lue', async () => {
  const alice = await signIn('alice@example.test')
  await notify({ userIds: [await userId(alice)], type: 'friend.request' })
  const [row] = (await feed(alice)).notifications

  const response = await app.request(`/api/notifications/${row?.id}/read`, {
    method: 'POST',
    headers: alice,
  })

  expect(response.status).toBe(200)
  expect((await feed(alice)).unread).toBe(0)
})

// Deux clics sur un réseau lent ne doivent pas produire une erreur.
it('accepte un second marquage sans rien changer', async () => {
  const alice = await signIn('alice@example.test')
  await notify({ userIds: [await userId(alice)], type: 'friend.request' })
  const [row] = (await feed(alice)).notifications

  await app.request(`/api/notifications/${row?.id}/read`, { method: 'POST', headers: alice })
  const second = await app.request(`/api/notifications/${row?.id}/read`, {
    method: 'POST',
    headers: alice,
  })

  expect(second.status).toBe(200)
})

// 404 et non 403 : « interdit » confirmerait que cette notification existe.
it("rend 404 sur la notification d'un autre", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await notify({ userIds: [await userId(bob)], type: 'friend.request' })
  const row = await prisma.notification.findFirstOrThrow()

  const response = await app.request(`/api/notifications/${row.id}/read`, {
    method: 'POST',
    headers: alice,
  })

  expect(response.status).toBe(404)
  expect((await prisma.notification.findFirstOrThrow()).readAt).toBeNull()
})

// Sans borne, un compte ancien rendrait tout son historique à chaque ouverture de la cloche.
it('borne la liste', async () => {
  const alice = await signIn('alice@example.test')
  const id = await userId(alice)
  for (let index = 0; index < 30; index += 1) {
    await notify({ userIds: [id], type: 'friend.request' })
  }

  expect((await feed(alice)).notifications.length).toBeLessThanOrEqual(20)
})

it('refuse une limite hors des bornes', async () => {
  const alice = await signIn('alice@example.test')

  const response = await app.request('/api/notifications?limit=500', { headers: alice })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'validation_error' })
})

it('exige une session sur le flux personnel', async () => {
  expect((await app.request('/api/me/stream')).status).toBe(401)
})
