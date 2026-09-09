import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { type ServerEvent, subscribe } from '../../src/lib/sse.ts'
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

// Crée un événement dont `alice` est administratrice et présente.
async function makeEvent(headers: Headers): Promise<string> {
  const response = await send('POST', '/api/events', headers, {
    title: 'Week-end',
    startsAt: '2026-10-01T18:00:00.000Z',
    endsAt: '2026-10-03T22:00:00.000Z',
  })
  return ((await response.json()) as { id: string }).id
}

async function addParticipant(
  headers: Headers,
  eventId: string,
  rsvp: 'invited' | 'accepted' | 'declined',
) {
  await prisma.eventParticipant.create({
    data: { eventId, userId: await userId(headers), rsvp },
  })
}

const propose = (headers: Headers, eventId: string, body: Record<string, unknown> = {}) =>
  send('POST', `/api/events/${eventId}/activities`, headers, { title: 'Musée', ...body })

it('refuse une proposition sans session', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const response = await app.request(`/api/events/${eventId}/activities`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Musée' }),
  })

  expect(response.status).toBe(401)
})

it('refuse une proposition d’un non-participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)

  const response = await propose(bob, eventId)

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'not_a_participant' })
})

it.each([['invited'], ['declined']] as const)(
  'refuse une proposition d’un participant %s',
  async (rsvp) => {
    const alice = await signIn('alice@example.test')
    const bob = await signIn('bob@example.test')
    const eventId = await makeEvent(alice)
    await addParticipant(bob, eventId, rsvp)

    const response = await propose(bob, eventId)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'must_accept_first' })
  },
)

it('accepte la proposition d’un participant ayant accepté', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')

  const response = await propose(bob, eventId, { title: 'Musée', address: '3 rue Test' })

  expect(response.status).toBe(201)
  const { id } = (await response.json()) as { id: string }
  const activity = await prisma.activity.findUniqueOrThrow({ where: { id } })
  expect(activity.status).toBe('proposed')
  expect(activity.address).toBe('3 rue Test')
})

it('rejette une activité dont la fin précède le début', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const response = await propose(alice, eventId, {
    startsAt: '2026-10-01T22:00:00.000Z',
    endsAt: '2026-10-01T18:00:00.000Z',
  })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'invalid_period' })
})

it('numérote les activités dans leur ordre de proposition', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  await propose(alice, eventId, { title: 'Musée' })
  await propose(alice, eventId, { title: 'Restaurant' })

  const activities = await prisma.activity.findMany({
    where: { eventId },
    orderBy: { position: 'asc' },
  })
  expect(activities.map((a) => [a.title, a.position])).toEqual([
    ['Musée', 0],
    ['Restaurant', 1],
  ])
})

it('laisse un invité consulter le programme avant de se décider', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'invited')
  await propose(alice, eventId)

  const response = await app.request(`/api/events/${eventId}/activities`, { headers: bob })

  expect(response.status).toBe(200)
  const { activities } = (await response.json()) as { activities: { title: string }[] }
  expect(activities).toHaveLength(1)
})

it('refuse le programme à un non-participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)

  const response = await app.request(`/api/events/${eventId}/activities`, { headers: bob })

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'not_a_participant' })
})

it('rend un décompte nul et aucun vote personnel tant que personne n’a voté', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  await propose(alice, eventId)

  const response = await app.request(`/api/events/${eventId}/activities`, { headers: alice })

  const { activities } = (await response.json()) as {
    activities: { tally: { for: number; against: number }; myVote: string | null }[]
  }
  expect(activities[0]?.tally).toEqual({ for: 0, against: 0 })
  expect(activities[0]?.myVote).toBeNull()
})

// --- vote -----------------------------------------------------------------------------

const vote = (headers: Headers, activityId: string, value: 'for' | 'against') =>
  send('POST', `/api/activities/${activityId}/vote`, headers, { value })

async function makeActivity(headers: Headers, eventId: string): Promise<string> {
  const response = await propose(headers, eventId)
  return ((await response.json()) as { id: string }).id
}

it('refuse le vote d’un participant qui n’a pas accepté', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'invited')
  const activityId = await makeActivity(alice, eventId)

  const response = await vote(bob, activityId, 'for')

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'must_accept_first' })
})

it('enregistre un vote et rend le décompte', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const activityId = await makeActivity(alice, eventId)

  const response = await vote(alice, activityId, 'for')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ for: 1, against: 0 })
  expect(await prisma.activityVote.count({ where: { activityId } })).toBe(1)
})

it('remplace le vote quand on change d’avis', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const activityId = await makeActivity(alice, eventId)

  await vote(alice, activityId, 'for')
  const response = await vote(alice, activityId, 'against')

  expect(await response.json()).toEqual({ for: 0, against: 1 })
  expect(await prisma.activityVote.count({ where: { activityId } })).toBe(1)
})

it('additionne les voix de deux participants', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  const activityId = await makeActivity(alice, eventId)

  await vote(alice, activityId, 'for')
  const response = await vote(bob, activityId, 'against')

  expect(await response.json()).toEqual({ for: 1, against: 1 })
})

it('refuse le vote sur une activité déjà tranchée', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const activityId = await makeActivity(alice, eventId)
  await prisma.activity.update({ where: { id: activityId }, data: { status: 'accepted' } })

  const response = await vote(alice, activityId, 'for')

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'activity_already_decided' })
})

it('diffuse le décompte sur le bus à chaque vote', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const activityId = await makeActivity(alice, eventId)

  // L'exception de la conception §5.2 : `activity.vote` transporte son contenu, parce que
  // c'est le compteur qui doit bouger en direct sans que le client recharge quoi que ce soit.
  const received: ServerEvent[] = []
  const unsubscribe = subscribe(eventId, (event) => received.push(event))

  try {
    await vote(alice, activityId, 'for')
  } finally {
    unsubscribe()
  }

  expect(received).toEqual([{ type: 'activity.vote', activityId, for: 1, against: 0 }])
})
