import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

// Un blocage s'arrêtait aux demandes d'ami : un administrateur pouvait encore inviter par
// adresse quelqu'un qu'il avait bloqué, ou qui l'avait bloqué. Il couvre désormais les
// invitations nominatives, avec la règle des demandes d'ami — même réponse, rien d'écrit,
// personne de notifié, aucun courriel — pour que le bloqué ne puisse pas déduire qu'il l'est.

afterEach(() => {
  vi.restoreAllMocks()
})

let alice: Headers
let bob: Headers
let eventId: string
let groupId: string
let logged: string[]

beforeEach(async () => {
  alice = await signIn('alice@example.test')
  bob = await signIn('bob@example.test')

  eventId = (
    await json<{ id: string }>(
      post('/api/events', alice, {
        title: 'Sortie',
        startsAt: '2026-10-01T18:00:00.000Z',
        endsAt: '2026-10-01T23:00:00.000Z',
      }),
    )
  ).id
  groupId = (await json<{ id: string }>(post('/api/groups', alice, { name: 'Les copains' }))).id

  logged = []
  vi.spyOn(console, 'info').mockImplementation((...parts: unknown[]) => {
    logged.push(parts.join(' '))
  })
})

function post(path: string, headers: Headers, body?: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: new Headers([...headers, ['content-type', 'application/json']]),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function json<T>(response: Promise<Response>): Promise<T> {
  return (await (await response).json()) as T
}

async function userId(headers: Headers): Promise<string> {
  return (await json<{ user: { id: string } }>(app.request('/api/me', { headers }))).user.id
}

const inviteToEvent = () =>
  post(`/api/events/${eventId}/invitations`, alice, { kind: 'email', email: 'bob@example.test' })

const inviteToGroup = () =>
  post(`/api/groups/${groupId}/members`, alice, { email: 'bob@example.test' })

async function expectNothingReachedBob() {
  expect(await prisma.invitation.count()).toBe(0)
  expect(await prisma.notification.count({ where: { userId: await userId(bob) } })).toBe(0)
  expect(logged.join('\n')).not.toContain('bob@example.test')
}

it('répond à une invitation vers un bloqué comme à une autre', async () => {
  const normal = await json(inviteToEvent())
  await prisma.invitation.deleteMany()

  await post(`/api/friends/blocks/${await userId(bob)}`, alice)
  const blocked = await json(inviteToEvent())

  expect(blocked).toEqual(normal)
})

it('n’invite pas à une sortie quelqu’un qu’on a bloqué', async () => {
  await post(`/api/friends/blocks/${await userId(bob)}`, alice)

  expect((await inviteToEvent()).status).toBe(200)
  await expectNothingReachedBob()
})

it('n’invite pas à une sortie quelqu’un qui nous a bloqué', async () => {
  await post(`/api/friends/blocks/${await userId(alice)}`, bob)

  expect((await inviteToEvent()).status).toBe(200)
  await expectNothingReachedBob()
})

it('n’invite pas dans un groupe, dans un sens comme dans l’autre', async () => {
  await post(`/api/friends/blocks/${await userId(alice)}`, bob)

  expect((await inviteToGroup()).status).toBe(200)
  await expectNothingReachedBob()
})

it('invite de nouveau après un déblocage', async () => {
  const bobId = await userId(bob)
  await post(`/api/friends/blocks/${bobId}`, alice)
  await app.request(`/api/friends/blocks/${bobId}`, { method: 'DELETE', headers: alice })

  await inviteToEvent()

  expect(await prisma.invitation.count()).toBe(1)
})
