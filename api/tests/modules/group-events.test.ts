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

it("invite d'office les autres membres du groupe", async () => {
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
