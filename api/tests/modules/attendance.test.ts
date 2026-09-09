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

async function proposeActivity(headers: Headers, eventId: string): Promise<string> {
  const response = await send('POST', `/api/events/${eventId}/activities`, headers, {
    title: 'Musée',
  })
  return ((await response.json()) as { id: string }).id
}

const setMode = (headers: Headers, activityId: string, attendanceMode: 'all' | 'optional') =>
  send('PATCH', `/api/activities/${activityId}`, headers, { attendanceMode })

const setAttendance = (headers: Headers, activityId: string, present: boolean) =>
  send('POST', `/api/activities/${activityId}/attendance`, headers, { present })

const listPresent = (headers: Headers, activityId: string) =>
  app.request(`/api/activities/${activityId}/attendance`, { headers })

it('enregistre une absence puis la retire quand on revient', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const activityId = await proposeActivity(alice, eventId)
  await setMode(alice, activityId, 'optional')

  const absent = await setAttendance(alice, activityId, false)

  expect(absent.status).toBe(200)
  expect(await absent.json()).toMatchObject({ present: false })

  const back = await setAttendance(alice, activityId, true)

  expect(await back.json()).toMatchObject({ present: true })
})

// Se déclarer deux fois absent ne doit pas produire d'erreur : deux clics sur un réseau
// lent sont une situation normale, pas une faute.
it('accepte deux fois la même absence', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const activityId = await proposeActivity(alice, eventId)
  await setMode(alice, activityId, 'optional')

  await setAttendance(alice, activityId, false)

  expect((await setAttendance(alice, activityId, false)).status).toBe(200)
})

// En mode `all`, l'absence n'aurait aucun effet sur le partage : l'accepter en silence
// laisserait croire le contraire.
it("refuse de se déclarer absent d'une activité en mode « all »", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const activityId = await proposeActivity(alice, eventId)

  const response = await setAttendance(alice, activityId, false)

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'attendance_not_optional' })
})

it("réserve le changement de mode à l'administrateur", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  const activityId = await proposeActivity(alice, eventId)

  const response = await setMode(bob, activityId, 'optional')

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'forbidden' })
})

it('rend tous ceux qui ont accepté en mode « all »', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carol = await signIn('carol@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  await addParticipant(carol, eventId, 'invited')
  const activityId = await proposeActivity(alice, eventId)

  const { present } = (await (await listPresent(alice, activityId)).json()) as {
    present: unknown[]
  }

  expect(present).toHaveLength(2)
})

it('retire les absents en mode « optional »', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  const activityId = await proposeActivity(alice, eventId)
  await setMode(alice, activityId, 'optional')
  await setAttendance(bob, activityId, false)

  const { present } = (await (await listPresent(alice, activityId)).json()) as {
    present: { participantId: string }[]
  }

  expect(present).toHaveLength(1)
})

it("refuse la déclaration à un participant qui n'a pas accepté", async () => {
  const alice = await signIn('alice@example.test')
  const carol = await signIn('carol@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(carol, eventId, 'invited')
  const activityId = await proposeActivity(alice, eventId)
  await setMode(alice, activityId, 'optional')

  const response = await setAttendance(carol, activityId, false)

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'must_accept_first' })
})
