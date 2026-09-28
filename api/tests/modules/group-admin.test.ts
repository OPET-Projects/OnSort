// api/tests/modules/group-admin.test.ts
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
