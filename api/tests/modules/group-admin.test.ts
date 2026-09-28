// api/tests/modules/group-admin.test.ts
import { afterEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

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

async function makeGroup(headers: Headers): Promise<string> {
  const response = await send('POST', '/api/groups', headers, { name: 'Les copains' })
  return ((await response.json()) as { id: string }).id
}

async function addMember(groupId: string, headers: Headers, role: 'admin' | 'member' = 'member') {
  await prisma.groupMember.create({ data: { groupId, userId: await userId(headers), role } })
}

const roleOf = async (groupId: string, headers: Headers) =>
  (
    await prisma.groupMember.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId: await userId(headers) } },
    })
  ).role

it('laisse un admin renommer le groupe', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await send('PATCH', `/api/groups/${groupId}`, alice, { name: 'La coloc' })

  expect(response.status).toBe(200)
  expect((await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).name).toBe('La coloc')
})

it('refuse le renommage à un simple membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)

  const response = await send('PATCH', `/api/groups/${groupId}`, bob, { name: 'X' })

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'forbidden' })
})

it('refuse un nom vide', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  expect((await send('PATCH', `/api/groups/${groupId}`, alice, { name: '  ' })).status).toBe(400)
})

it('promeut puis rétrograde un membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  const path = `/api/groups/${groupId}/members/${await userId(bob)}`

  expect((await send('PATCH', path, alice, { role: 'admin' })).status).toBe(200)
  expect(await roleOf(groupId, bob)).toBe('admin')

  expect((await send('PATCH', path, alice, { role: 'member' })).status).toBe(200)
  expect(await roleOf(groupId, bob)).toBe('member')
})

it('refuse de rétrograder le dernier admin', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await send(
    'PATCH',
    `/api/groups/${groupId}/members/${await userId(alice)}`,
    alice,
    { role: 'member' },
  )

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'last_admin' })
})

it('refuse le changement de rôle à un simple membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)

  const response = await send('PATCH', `/api/groups/${groupId}/members/${await userId(bob)}`, bob, {
    role: 'admin',
  })

  expect(response.status).toBe(403)
})

it('rend 404 sur une cible qui n’est pas membre', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await send('PATCH', `/api/groups/${groupId}/members/inconnu`, alice, {
    role: 'admin',
  })

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'member_not_found' })
})

const leave = async (groupId: string, headers: Headers) =>
  send('DELETE', `/api/groups/${groupId}/members/${await userId(headers)}`, headers)

it('laisse un membre quitter le groupe', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)

  const response = await leave(groupId, bob)

  expect(await response.json()).toEqual({ groupDeleted: false })
  expect(await prisma.groupMember.count({ where: { groupId } })).toBe(1)
})

it('laisse un admin retirer un membre, pas un membre retirer un autre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  await addMember(groupId, carla)

  const byMember = await send(
    'DELETE',
    `/api/groups/${groupId}/members/${await userId(carla)}`,
    bob,
  )
  expect(byMember.status).toBe(403)

  const byAdmin = await send(
    'DELETE',
    `/api/groups/${groupId}/members/${await userId(carla)}`,
    alice,
  )
  expect(byAdmin.status).toBe(200)
  expect(await prisma.groupMember.count({ where: { groupId } })).toBe(2)
})

it('rend 404 au retrait de quelqu’un qui n’est pas membre', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await send('DELETE', `/api/groups/${groupId}/members/inconnu`, alice)

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'member_not_found' })
})

it('promeut le membre le plus ancien quand le dernier admin part', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  await addMember(groupId, carla)

  await leave(groupId, alice)

  expect(await roleOf(groupId, bob)).toBe('admin')
  expect(await roleOf(groupId, carla)).toBe('member')
})

it('supprime le groupe au départ du dernier membre, sans toucher ses sorties', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)
  const created = await send('POST', '/api/events', alice, {
    title: 'Raclette',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 90_000_000).toISOString(),
    groupId,
  })
  const eventId = ((await created.json()) as { id: string }).id

  const response = await leave(groupId, alice)

  expect(await response.json()).toEqual({ groupDeleted: true })
  expect(await prisma.group.count({ where: { id: groupId } })).toBe(0)
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  expect(event.groupId).toBeNull()
  expect(await prisma.eventParticipant.count({ where: { eventId } })).toBe(1)
})

it('laisse intactes les participations de qui part', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob)
  await send('POST', '/api/events', alice, {
    title: 'Raclette',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 90_000_000).toISOString(),
    groupId,
  })

  await leave(groupId, bob)

  expect(await prisma.eventParticipant.count({ where: { userId: await userId(bob) } })).toBe(1)
})

it('garde un admin quand deux admins partent en même temps', async () => {
  for (let round = 0; round < 5; round += 1) {
    const alice = await signIn(`alice-${round}@example.test`)
    const bob = await signIn(`bob-${round}@example.test`)
    const carla = await signIn(`carla-${round}@example.test`)
    const groupId = await makeGroup(alice)
    await addMember(groupId, bob, 'admin')
    await addMember(groupId, carla)

    await Promise.all([leave(groupId, alice), leave(groupId, bob)])

    expect(await roleOf(groupId, carla)).toBe('admin')
  }
})

it("dit à l'appelant qui il est dans la fiche du groupe", async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const { group } = (await (
    await app.request(`/api/groups/${groupId}`, { headers: alice })
  ).json()) as {
    group: { viewer: { userId: string; role: string } }
  }

  expect(group.viewer).toEqual({ userId: await userId(alice), role: 'admin' })
})

// Un admin rétrogradé entre sa vérification de droits et la prise du verrou ne doit plus
// pouvoir agir : la rétrogradation est glissée juste avant la transaction.
it('refuse un retrait à un admin rétrogradé au même instant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob, 'admin')
  await addMember(groupId, carla)
  const bobId = await userId(bob)

  const original = prisma.$transaction.bind(prisma)
  vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (...args: unknown[]) => {
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: bobId } },
      data: { role: 'member' },
    })
    return (original as (...a: unknown[]) => Promise<unknown>)(...args)
  })

  const response = await send(
    'DELETE',
    `/api/groups/${groupId}/members/${await userId(carla)}`,
    bob,
  )

  expect(response.status).toBe(403)
  expect(await prisma.groupMember.count({ where: { groupId } })).toBe(3)
})

it('refuse un changement de rôle à un admin rétrogradé au même instant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carla = await signIn('carla@example.test')
  const groupId = await makeGroup(alice)
  await addMember(groupId, bob, 'admin')
  await addMember(groupId, carla)
  const bobId = await userId(bob)

  const original = prisma.$transaction.bind(prisma)
  vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (...args: unknown[]) => {
    await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: bobId } },
      data: { role: 'member' },
    })
    return (original as (...a: unknown[]) => Promise<unknown>)(...args)
  })

  const response = await send(
    'PATCH',
    `/api/groups/${groupId}/members/${await userId(carla)}`,
    bob,
    { role: 'admin' },
  )

  expect(response.status).toBe(403)
  expect(await roleOf(groupId, carla)).toBe('member')
})
