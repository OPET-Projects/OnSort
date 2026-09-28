import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { type ServerEvent, subscribe } from '../../src/lib/sse.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

// Annulation d'une activité (conception §3.7). `cancelled_at` est renseigné, **sans
// suppression physique** : les votes restent, les dépenses aussi — un acompte non
// remboursable existe. Le rétablissement existe parce qu'aucun état de cette application
// n'a le droit d'être absorbant.

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

async function join(headers: Headers, eventId: string, role: 'admin' | 'member' = 'member') {
  await prisma.eventParticipant.create({
    data: { eventId, userId: await userId(headers), rsvp: 'accepted', role },
  })
}

const cancel = (headers: Headers, activityId: string, cancelled: boolean) =>
  send('POST', `/api/activities/${activityId}/cancel`, headers, { cancelled })

async function setUp() {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await join(bob, eventId)

  const created = await send('POST', `/api/events/${eventId}/activities`, alice, {
    title: 'Musée',
  })
  const { id: activityId } = (await created.json()) as { id: string }

  return { alice, bob, eventId, activityId }
}

it('renseigne cancelled_at sans rien supprimer', async () => {
  const { alice, activityId } = await setUp()

  const response = await cancel(alice, activityId, true)

  expect(response.status).toBe(200)

  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } })
  expect(activity.cancelledAt).not.toBeNull()
})

it('rétablit une activité annulée', async () => {
  const { alice, activityId } = await setUp()

  await cancel(alice, activityId, true)
  const response = await cancel(alice, activityId, false)

  expect(response.status).toBe(200)

  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } })
  expect(activity.cancelledAt).toBeNull()
})

it('laisse l’activité annulée dans le programme, marquée', async () => {
  const { alice, eventId, activityId } = await setUp()

  await cancel(alice, activityId, true)

  const response = await app.request(`/api/events/${eventId}/activities`, { headers: alice })
  const { activities } = (await response.json()) as {
    activities: { id: string; cancelledAt: string | null }[]
  }

  expect(activities).toHaveLength(1)
  expect(typeof activities[0].cancelledAt).toBe('string')
})

it('garde les votes de l’activité annulée', async () => {
  const { alice, bob, activityId } = await setUp()

  await send('POST', `/api/activities/${activityId}/vote`, bob, { value: 'for' })
  await cancel(alice, activityId, true)

  expect(await prisma.activityVote.count({ where: { activityId } })).toBe(1)
})

// §3.7 : « les dépenses associées survivent — un acompte non remboursable existe ». Les
// soldes sont calculés par événement, pas par activité : il n'y a rien à faire, et c'est
// justement le point à ne pas « corriger ».
it('laisse les dépenses rattachées et les soldes intacts', async () => {
  const { alice, bob, eventId, activityId } = await setUp()

  await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Acompte',
    amountCents: 5000,
    activityId,
  })

  const before = await (
    await app.request(`/api/events/${eventId}/balances`, { headers: bob })
  ).json()

  await cancel(alice, activityId, true)

  const after = await (
    await app.request(`/api/events/${eventId}/balances`, { headers: bob })
  ).json()

  expect(await prisma.expense.count({ where: { activityId } })).toBe(1)
  expect(after).toEqual(before)
})

// Une activité annulée n'attend plus l'avis de personne.
it('refuse un vote sur une activité annulée', async () => {
  const { alice, bob, activityId } = await setUp()

  await cancel(alice, activityId, true)

  const response = await send('POST', `/api/activities/${activityId}/vote`, bob, { value: 'for' })

  expect(response.status).toBe(409)
  expect((await response.json()) as { code: string }).toMatchObject({ code: 'activity_cancelled' })
})

it('est réservé à l’administrateur', async () => {
  const { bob, activityId } = await setUp()

  const response = await cancel(bob, activityId, true)

  expect(response.status).toBe(403)

  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } })
  expect(activity.cancelledAt).toBeNull()
})

it('diffuse activity.cancelled et notifie les participants, sauf l’auteur', async () => {
  const { alice, bob, eventId, activityId } = await setUp()

  const received: ServerEvent[] = []
  const unsubscribe = subscribe(eventId, (event) => received.push(event))

  try {
    await cancel(alice, activityId, true)
  } finally {
    unsubscribe()
  }

  expect(received.filter((event) => event.type === 'activity.cancelled')).toHaveLength(1)

  const notifications = await prisma.notification.findMany({
    where: { type: 'activity.cancelled' },
  })

  expect(notifications).toHaveLength(1)
  expect(notifications[0].userId).toBe(await userId(bob))
})
