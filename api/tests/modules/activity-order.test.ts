import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { type ServerEvent, subscribe } from '../../src/lib/sse.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

// Réordonnancement du programme (conception §5.1, plan M7 décision 4). La route reçoit la
// **liste complète** des identifiants, jamais un déplacement : « monte celle-ci d'un cran »
// dépendrait de l'ordre supposé par un client qui peut être périmé.

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

async function addActivity(headers: Headers, eventId: string, title: string): Promise<string> {
  const response = await send('POST', `/api/events/${eventId}/activities`, headers, { title })
  return ((await response.json()) as { id: string }).id
}

async function titlesInOrder(headers: Headers, eventId: string): Promise<string[]> {
  const response = await app.request(`/api/events/${eventId}/activities`, { headers })
  const { activities } = (await response.json()) as { activities: { title: string }[] }
  return activities.map((activity) => activity.title)
}

const reorder = (headers: Headers, eventId: string, activityIds: string[]) =>
  send('PATCH', `/api/events/${eventId}/activities/order`, headers, { activityIds })

async function setUp() {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  return {
    alice,
    eventId,
    first: await addActivity(alice, eventId, 'Musée'),
    second: await addActivity(alice, eventId, 'Restaurant'),
    third: await addActivity(alice, eventId, 'Concert'),
  }
}

it('rend le programme dans l’ordre demandé', async () => {
  const { alice, eventId, first, second, third } = await setUp()

  expect(await titlesInOrder(alice, eventId)).toEqual(['Musée', 'Restaurant', 'Concert'])

  const response = await reorder(alice, eventId, [third, first, second])

  expect(response.status).toBe(200)
  expect(await titlesInOrder(alice, eventId)).toEqual(['Concert', 'Musée', 'Restaurant'])
})

it('refuse une liste incomplète', async () => {
  const { alice, eventId, first, second } = await setUp()

  const response = await reorder(alice, eventId, [second, first])

  expect(response.status).toBe(400)
  expect((await response.json()) as { code: string }).toMatchObject({ code: 'invalid_order' })
  expect(await titlesInOrder(alice, eventId)).toEqual(['Musée', 'Restaurant', 'Concert'])
})

it('refuse un doublon', async () => {
  const { alice, eventId, first, second } = await setUp()

  const response = await reorder(alice, eventId, [first, second, second])

  expect(response.status).toBe(400)
  expect((await response.json()) as { code: string }).toMatchObject({ code: 'invalid_order' })
})

it('refuse une activité d’un autre événement', async () => {
  const { alice, eventId, first, second } = await setUp()
  const otherEventId = await makeEvent(alice)
  const stranger = await addActivity(alice, otherEventId, 'Piscine')

  const response = await reorder(alice, eventId, [first, second, stranger])

  expect(response.status).toBe(400)
  expect((await response.json()) as { code: string }).toMatchObject({ code: 'invalid_order' })
})

it('est réservé à l’administrateur', async () => {
  const { alice, eventId, first, second, third } = await setUp()
  const bob = await signIn('bob@example.test')

  await prisma.eventParticipant.create({
    data: { eventId, userId: await userId(bob), rsvp: 'accepted', role: 'member' },
  })

  const response = await reorder(bob, eventId, [third, second, first])

  expect(response.status).toBe(403)
  expect(await titlesInOrder(alice, eventId)).toEqual(['Musée', 'Restaurant', 'Concert'])
})

// Une diffusion par activité déplacée ferait recharger le programme trois fois pour un seul
// geste.
it('diffuse activity.updated une seule fois', async () => {
  const { alice, eventId, first, second, third } = await setUp()

  const received: ServerEvent[] = []
  const unsubscribe = subscribe(eventId, (event) => received.push(event))

  try {
    await reorder(alice, eventId, [third, second, first])
  } finally {
    unsubscribe()
  }

  expect(received.filter((event) => event.type === 'activity.updated')).toHaveLength(1)
})
