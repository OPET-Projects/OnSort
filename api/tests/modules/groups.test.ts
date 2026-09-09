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

async function makeGroup(headers: Headers, name = 'Les copains'): Promise<string> {
  const response = await send('POST', '/api/groups', headers, { name })
  return ((await response.json()) as { id: string }).id
}

const invite = (headers: Headers, groupId: string, email: string) =>
  send('POST', `/api/groups/${groupId}/members`, headers, { email })

it('refuse sans session', async () => {
  expect((await app.request('/api/groups')).status).toBe(401)
})

it('fait du créateur un administrateur du groupe', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const member = await prisma.groupMember.findFirstOrThrow({ where: { groupId } })

  expect(member.role).toBe('admin')
  expect(member.userId).toBe(await userId(alice))
})

it("ne liste que les groupes de l'appelant", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await makeGroup(alice)

  const mine = (await (await app.request('/api/groups', { headers: alice })).json()) as {
    groups: unknown[]
  }
  const theirs = (await (await app.request('/api/groups', { headers: bob })).json()) as {
    groups: unknown[]
  }

  expect(mine.groups).toHaveLength(1)
  expect(theirs.groups).toEqual([])
})

it('refuse la lecture à un non-membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)

  const response = await app.request(`/api/groups/${groupId}`, { headers: bob })

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'not_a_member' })
})

it('rend 404 sur un groupe inconnu', async () => {
  const alice = await signIn('alice@example.test')

  const response = await app.request('/api/groups/00000000-0000-4000-8000-000000000000', {
    headers: alice,
  })

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'group_not_found' })
})

it("réserve l'invitation à un administrateur du groupe", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await prisma.groupMember.create({ data: { groupId, userId: await userId(bob) } })

  const response = await invite(bob, groupId, 'carla@example.test')

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'forbidden' })
})

// §5.1 écrit `POST /groups/:id/members`, ce qui se lirait « insère cette personne ».
// L'insertion directe serait un oracle d'énumération : on crée une invitation.
it("crée une invitation de groupe plutôt qu'une adhésion", async () => {
  const alice = await signIn('alice@example.test')
  await signIn('bob@example.test')
  const groupId = await makeGroup(alice)

  const response = await invite(alice, groupId, 'bob@example.test')

  expect(response.status).toBe(200)
  expect(await prisma.groupMember.count({ where: { groupId } })).toBe(1)

  const invitation = await prisma.invitation.findFirstOrThrow({ where: { targetId: groupId } })
  expect(invitation.scope).toBe('group')
})

// Anti-énumération (§4) : même réponse que l'adresse ait un compte ou non.
it('répond à l’identique pour une adresse inconnue', async () => {
  const alice = await signIn('alice@example.test')
  await signIn('bob@example.test')
  const groupId = await makeGroup(alice)

  const known = await invite(alice, groupId, 'bob@example.test')
  const unknown = await invite(alice, groupId, 'personne@example.test')

  expect(unknown.status).toBe(known.status)
  expect(await unknown.json()).toEqual(await known.json())
})

it('fait entrer l’invité qui accepte', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await invite(alice, groupId, 'bob@example.test')

  const invitation = await prisma.invitation.findFirstOrThrow({ where: { targetId: groupId } })
  const response = await send('POST', `/api/invitations/${invitation.id}/accept`, bob)

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ groupId })

  const member = await prisma.groupMember.findFirstOrThrow({
    where: { groupId, userId: await userId(bob) },
  })
  expect(member.role).toBe('member')
})

it("rend un aperçu de groupe avant d'accepter", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice, 'Les copains')
  await invite(alice, groupId, 'bob@example.test')

  const invitation = await prisma.invitation.findFirstOrThrow({ where: { targetId: groupId } })
  const response = await app.request(`/api/invitations/${invitation.id}`, { headers: bob })

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    scope: 'group',
    groupId,
    title: 'Les copains',
    alreadyMember: false,
  })
})

it('signale un invité déjà membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await invite(alice, groupId, 'bob@example.test')
  const invitation = await prisma.invitation.findFirstOrThrow({ where: { targetId: groupId } })
  await send('POST', `/api/invitations/${invitation.id}/accept`, bob)

  const response = await app.request(`/api/invitations/${invitation.id}`, { headers: bob })

  expect(await response.json()).toMatchObject({ alreadyMember: true })
})

it('rend les membres du groupe à un membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await prisma.groupMember.create({ data: { groupId, userId: await userId(bob) } })

  const response = await app.request(`/api/groups/${groupId}`, { headers: bob })
  const { group } = (await response.json()) as {
    group: { name: string; members: { name: string }[]; viewer: { role: string } }
  }

  expect(group.members).toHaveLength(2)
  expect(group.viewer.role).toBe('member')
})

it('refuse un nom vide', async () => {
  const alice = await signIn('alice@example.test')

  const response = await send('POST', '/api/groups', alice, { name: '   ' })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'validation_error' })
})
