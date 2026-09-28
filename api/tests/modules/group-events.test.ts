import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { subscribe } from '../../src/lib/sse.ts'
import { app } from '../../src/main.ts'
import { acceptInvitation } from '../../src/modules/invitations/service.ts'
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

// Entrée par le chemin réel des trois canaux : une invitation nominative acceptée.
async function join(groupId: string, headers: Headers, email: string) {
  const invitation = await prisma.invitation.create({
    data: { scope: 'group', targetId: groupId, invitedEmail: email, invitedBy: 'unused' },
  })
  await acceptInvitation({ id: await userId(headers), email }, invitation.id)
}

it('ajoute un nouvel arrivant aux événements à venir du groupe', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const upcoming = await eventIdOf(await makeEvent(alice, groupId, 7))

  await join(groupId, bob, 'bob@example.test')

  const row = await prisma.eventParticipant.findUniqueOrThrow({
    where: { eventId_userId: { eventId: upcoming, userId: await userId(bob) } },
  })
  expect(row).toMatchObject({ role: 'member', rsvp: 'invited' })
})

it("ne l'ajoute ni aux événements passés ni à ceux déjà commencés", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const past = await eventIdOf(await makeEvent(alice, groupId, -7))
  // Commencé hier, se termine dans trois jours : un séjour en cours.
  const started = await prisma.event.create({
    data: {
      title: 'Séjour',
      startsAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() + 3 * DAY),
      createdBy: await userId(alice),
      groupId,
    },
  })

  await join(groupId, bob, 'bob@example.test')

  const bobId = await userId(bob)
  expect(await prisma.eventParticipant.count({ where: { userId: bobId, eventId: past } })).toBe(0)
  expect(
    await prisma.eventParticipant.count({ where: { userId: bobId, eventId: started.id } }),
  ).toBe(0)
})

it('laisse intact un participant déjà présent à titre individuel', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))
  await prisma.eventParticipant.create({
    data: { eventId, userId: await userId(bob), role: 'admin', rsvp: 'declined' },
  })

  await join(groupId, bob, 'bob@example.test')

  const row = await prisma.eventParticipant.findUniqueOrThrow({
    where: { eventId_userId: { eventId, userId: await userId(bob) } },
  })
  expect(row).toMatchObject({ role: 'admin', rsvp: 'declined' })
  expect(await prisma.notification.count({ where: { type: 'event.invited' } })).toBe(0)
})

it('est idempotent quand on rejoint deux fois', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))

  await join(groupId, bob, 'bob@example.test')
  await join(groupId, bob, 'bob@example.test')

  expect(await prisma.eventParticipant.count({ where: { eventId } })).toBe(2)
  expect(await prisma.notification.count({ where: { type: 'event.invited' } })).toBe(1)
})

it('notifie le nouvel arrivant et publie sur le flux de chaque événement', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))
  const received: unknown[] = []
  const unsubscribe = subscribe(eventId, (message) => received.push(message))

  try {
    await join(groupId, bob, 'bob@example.test')
  } finally {
    unsubscribe()
  }

  const notification = await prisma.notification.findFirstOrThrow({
    where: { type: 'event.invited' },
  })
  expect(notification).toMatchObject({ userId: await userId(bob), eventId })
  expect(received).toEqual([{ type: 'participant.joined', id: expect.any(String) }])
})

it("ne notifie rien quand le groupe n'a aucun événement à venir", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)

  await join(groupId, bob, 'bob@example.test')

  expect(await prisma.notification.count({ where: { type: 'event.invited' } })).toBe(0)
})

it("laisse intactes les parts d'une dépense antérieure", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))
  const expense = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Fromage',
    amountCents: 3000,
    splitMode: 'equal',
  })
  expect(expense.status).toBe(201)
  const before = await prisma.expenseShare.findMany({ orderBy: { id: 'asc' } })

  await join(groupId, bob, 'bob@example.test')

  expect(await prisma.expenseShare.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
})

// Probabiliste : il peut passer par chance sans le verrou. Vérifié une fois en retirant
// le verrou — il échoue alors dans la plupart des exécutions.
it('inscrit toujours le membre quand création et arrivée se croisent', async () => {
  for (let round = 0; round < 5; round += 1) {
    const alice = await signIn(`alice-${round}@example.test`)
    const bob = await signIn(`bob-${round}@example.test`)
    const groupId = await makeGroup(alice)

    const [created] = await Promise.all([
      makeEvent(alice, groupId),
      join(groupId, bob, `bob-${round}@example.test`),
    ])
    const eventId = await eventIdOf(created)

    const count = await prisma.eventParticipant.count({
      where: { eventId, userId: await userId(bob) },
    })
    expect(count).toBe(1)
  }
})

it("liste les sorties du groupe avec la réponse de l'appelant", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  const later = await eventIdOf(await makeEvent(alice, groupId, 14))
  const sooner = await eventIdOf(await makeEvent(alice, groupId, 3))

  const response = await app.request(`/api/groups/${groupId}`, { headers: bob })
  const { group } = (await response.json()) as {
    group: { events: { id: string; rsvp: string | null }[] }
  }

  expect(group.events.map((event) => event.id)).toEqual([sooner, later])
  expect(group.events.every((event) => event.rsvp === 'invited')).toBe(true)
})

// Un membre arrivé pendant un séjour en cours voit la sortie sans y être inscrit.
it('rend une réponse nulle pour une sortie à laquelle on ne participe pas', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await makeEvent(alice, groupId)
  await addMember(groupId, bob)

  const response = await app.request(`/api/groups/${groupId}`, { headers: bob })
  const { group } = (await response.json()) as { group: { events: { rsvp: string | null }[] } }

  expect(group.events[0]?.rsvp).toBeNull()
})

it("expose le groupe d'une sortie et son nom dans la liste", async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)
  const inGroup = await eventIdOf(await makeEvent(alice, groupId))
  const adHoc = await eventIdOf(await makeEvent(alice))

  const detail = (await (
    await app.request(`/api/events/${inGroup}`, { headers: alice })
  ).json()) as {
    event: { group: unknown }
  }
  expect(detail.event.group).toEqual({ id: groupId, name: 'Les copains', viewerIsMember: true })

  const adHocDetail = (await (
    await app.request(`/api/events/${adHoc}`, { headers: alice })
  ).json()) as { event: { group: unknown } }
  expect(adHocDetail.event.group).toBeNull()

  const list = (await (await app.request('/api/events', { headers: alice })).json()) as {
    events: { id: string; groupName: string | null }[]
  }
  const nameOf = new Map(list.events.map((event) => [event.id, event.groupName]))
  expect(nameOf.get(inGroup)).toBe('Les copains')
  expect(nameOf.get(adHoc)).toBeNull()
})

// Un invité extérieur au groupe voit à quel groupe appartient la sortie, mais ne peut pas
// ouvrir ce groupe : l'interface doit le savoir pour ne pas lui tendre un lien qui mène à un 403.
it("dit à un participant extérieur qu'il n'est pas membre du groupe", async () => {
  const alice = await signIn('alice@example.test')
  const dan = await signIn('dan@example.test')
  const groupId = await makeGroup(alice)
  const eventId = await eventIdOf(await makeEvent(alice, groupId))
  await prisma.eventParticipant.create({ data: { eventId, userId: await userId(dan) } })

  const detail = (await (await app.request(`/api/events/${eventId}`, { headers: dan })).json()) as {
    event: { group: unknown }
  }

  expect(detail.event.group).toEqual({ id: groupId, name: 'Les copains', viewerIsMember: false })
})
