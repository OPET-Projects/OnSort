import { afterEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

// `signIn` lit le lien magique dans la sortie de `console.info` : une doublure laissée en
// place aveuglerait les connexions suivantes.
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

async function makeEvent(headers: Headers): Promise<string> {
  const response = await send('POST', '/api/events', headers, {
    title: 'Week-end',
    startsAt: '2026-10-01T18:00:00.000Z',
    endsAt: '2026-10-03T22:00:00.000Z',
  })
  return ((await response.json()) as { id: string }).id
}

async function joinEvent(headers: Headers, eventId: string, rsvp = 'accepted') {
  await prisma.eventParticipant.create({
    data: { eventId, userId: await userId(headers), rsvp: rsvp as 'accepted' | 'invited' },
  })
}

const typesFor = async (headers: Headers): Promise<string[]> => {
  const rows = await prisma.notification.findMany({ where: { userId: await userId(headers) } })
  return rows.map((row) => row.type)
}

it("notifie l'invité nominatif d'un événement", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)

  await send('POST', `/api/events/${eventId}/invitations`, alice, {
    kind: 'email',
    email: 'bob@example.test',
  })

  expect(await typesFor(bob)).toContain('event.invited')
})

it('ne notifie personne sur un lien partageable', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  await send('POST', `/api/events/${eventId}/invitations`, alice, { kind: 'link' })

  expect(await prisma.notification.count()).toBe(0)
})

it("notifie l'invité nominatif d'un groupe", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const created = await send('POST', '/api/groups', alice, { name: 'Les copains' })
  const { id: groupId } = (await created.json()) as { id: string }

  await send('POST', `/api/groups/${groupId}/members`, alice, { email: 'bob@example.test' })

  expect(await typesFor(bob)).toContain('group.invited')
})

// « La notification tu dois voter » (§2.9) : elle part vers ceux qui ont accepté, sauf le
// proposant. L'envoyer à qui n'a pas accepté serait du bruit — ils ne peuvent pas voter.
it("notifie les participants ayant accepté d'une activité proposée", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  const eventId = await makeEvent(alice)
  await joinEvent(bob, eventId, 'accepted')
  await joinEvent(carla, eventId, 'invited')

  await send('POST', `/api/events/${eventId}/activities`, alice, { title: 'Musée' })

  expect(await typesFor(bob)).toContain('activity.proposed')
  expect(await typesFor(carla)).toEqual([])
  expect(await typesFor(alice)).toEqual([])
})

it('notifie la décision, sauf à celui qui décide', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await joinEvent(bob, eventId)
  const proposed = await send('POST', `/api/events/${eventId}/activities`, bob, { title: 'Musée' })
  const { id: activityId } = (await proposed.json()) as { id: string }
  await prisma.notification.deleteMany()

  await send('POST', `/api/activities/${activityId}/decision`, alice, { status: 'accepted' })

  expect(await typesFor(bob)).toContain('activity.decided')
  expect(await typesFor(alice)).toEqual([])
})

it("notifie les bénéficiaires d'une dépense, sauf son auteur", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await joinEvent(bob, eventId)

  await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Taxi',
    amountCents: 1000,
  })

  expect(await typesFor(bob)).toContain('expense.created')
  expect(await typesFor(alice)).toEqual([])
})

it('notifie le créancier à la déclaration, puis le débiteur à la confirmation', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await joinEvent(bob, eventId)
  const aliceParticipant = await prisma.eventParticipant.findFirstOrThrow({
    where: { eventId, userId: await userId(alice) },
  })

  const declared = await send('POST', `/api/events/${eventId}/settlements`, bob, {
    toParticipantId: aliceParticipant.id,
    amountCents: 500,
  })
  const { settlement } = (await declared.json()) as { settlement: { id: string } }

  expect(await typesFor(alice)).toContain('settlement.declared')
  expect(await typesFor(bob)).toEqual([])

  await send('POST', `/api/settlements/${settlement.id}/confirm`, alice)

  expect(await typesFor(bob)).toContain('settlement.confirmed')
})

// Une notification rattachée à son événement permet à l'interface d'y renvoyer d'un clic.
it("rattache la notification d'activité à son événement", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await joinEvent(bob, eventId)

  await send('POST', `/api/events/${eventId}/activities`, alice, { title: 'Musée' })

  const row = await prisma.notification.findFirstOrThrow({ where: { userId: await userId(bob) } })
  expect(row.eventId).toBe(eventId)
})

// Le payload porte de quoi afficher une ligne, et rien de plus : ni adresse, ni montant.
it("ne fait pas voyager d'adresse dans une notification", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await joinEvent(bob, eventId)

  await send('POST', `/api/events/${eventId}/activities`, alice, { title: 'Musée' })

  const rows = await prisma.notification.findMany()
  expect(JSON.stringify(rows)).not.toContain('@example.test')
})
