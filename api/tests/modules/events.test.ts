import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

const period = {
  startsAt: '2026-10-01T18:00:00.000Z',
  endsAt: '2026-10-01T22:00:00.000Z',
}

async function post(path: string, headers: Headers, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: new Headers([...headers, ['content-type', 'application/json']]),
    body: JSON.stringify(body),
  })
}

async function createEvent(headers: Headers, overrides: Record<string, unknown> = {}) {
  const response = await post('/api/events', headers, {
    title: 'Sortie au parc',
    ...period,
    ...overrides,
  })
  return response
}

it('refuse la création sans session', async () => {
  const response = await app.request('/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'x', ...period }),
  })
  expect(response.status).toBe(401)
})

it('crée un événement en brouillon avec son créateur pour administrateur', async () => {
  const alice = await signIn('alice@example.test')
  const response = await createEvent(alice)

  expect(response.status).toBe(201)
  const { id } = (await response.json()) as { id: string }

  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    include: { participants: true },
  })
  expect(event.status).toBe('draft')
  expect(event.participants).toHaveLength(1)
  expect(event.participants[0]).toMatchObject({ role: 'admin', rsvp: 'accepted' })
})

it('rejette une période où la fin précède le début', async () => {
  const alice = await signIn('alice@example.test')
  const response = await createEvent(alice, {
    startsAt: '2026-10-01T22:00:00.000Z',
    endsAt: '2026-10-01T18:00:00.000Z',
  })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'invalid_period' })
})

it('ne liste que les événements de l’appelant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await createEvent(alice, { title: 'Chez Alice' })
  await createEvent(bob, { title: 'Chez Bob' })

  const response = await app.request('/api/events', { headers: alice })
  const { events } = (await response.json()) as { events: { title: string }[] }

  expect(events).toHaveLength(1)
  expect(events[0]?.title).toBe('Chez Alice')
})

it('interdit la lecture d’un événement à un non-participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  const response = await app.request(`/api/events/${id}`, { headers: bob })
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'not_a_participant' })
})

it('répond 404 sur un événement inexistant', async () => {
  const alice = await signIn('alice@example.test')
  const response = await app.request('/api/events/does-not-exist', { headers: alice })
  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'event_not_found' })
})

it('rend l’événement et ses participants à un participant', async () => {
  const alice = await signIn('alice@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  const response = await app.request(`/api/events/${id}`, { headers: alice })
  expect(response.status).toBe(200)
  const { event } = (await response.json()) as {
    event: { participants: { email: string }[]; viewer: { role: string } }
  }
  expect(event.participants[0]?.email).toBe('alice@example.test')
  expect(event.viewer.role).toBe('admin')
})
