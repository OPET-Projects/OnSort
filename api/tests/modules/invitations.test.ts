import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { hashInviteToken } from '../../src/lib/tokens.ts'
import { app } from '../../src/main.ts'
import { acceptInvitation } from '../../src/modules/invitations/service.ts'
import { signIn } from '../helpers/auth.ts'

async function userId(headers: Headers): Promise<string> {
  const me = await app.request('/api/me', { headers })
  return ((await me.json()) as { user: { id: string } }).user.id
}

async function makeEvent(headers: Headers): Promise<string> {
  const response = await app.request('/api/events', {
    method: 'POST',
    headers: new Headers([...headers, ['content-type', 'application/json']]),
    body: JSON.stringify({
      title: 'Sortie',
      startsAt: '2026-10-01T18:00:00.000Z',
      endsAt: '2026-10-01T22:00:00.000Z',
    }),
  })
  return ((await response.json()) as { id: string }).id
}

async function makeLink(eventId: string, adminId: string, overrides = {}) {
  const token = 'raw-token-for-tests'
  await prisma.inviteLink.create({
    data: {
      scope: 'event',
      targetId: eventId,
      tokenHash: hashInviteToken(token),
      createdBy: adminId,
      ...overrides,
    },
  })
  return token
}

const accept = (token: string, headers?: Headers) =>
  app.request(`/api/invitations/${token}/accept`, { method: 'POST', headers })

it('refuse l’acceptation sans session', async () => {
  expect((await accept('whatever')).status).toBe(401)
})

it('fait rejoindre l’événement sur un lien valide, et reste idempotent', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  const token = await makeLink(eventId, await userId(alice))

  const first = await accept(token, bob)
  expect(first.status).toBe(200)
  expect(await first.json()).toEqual({ eventId })

  const second = await accept(token, bob)
  expect(second.status).toBe(200)

  const rows = await prisma.eventParticipant.findMany({
    where: { eventId, userId: await userId(bob) },
  })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ role: 'member', rsvp: 'invited' })
})

it('rejette un lien révoqué', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  const token = await makeLink(eventId, await userId(alice), { revokedAt: new Date() })

  const response = await accept(token, bob)
  expect(response.status).toBe(410)
  expect(
    await prisma.eventParticipant.findMany({ where: { userId: await userId(bob) } }),
  ).toHaveLength(0)
})

it('rejette un lien expiré', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  const token = await makeLink(eventId, await userId(alice), {
    expiresAt: new Date(Date.now() - 1000),
  })

  expect((await accept(token, bob)).status).toBe(410)
})

it('accepte une invitation nominative par le bon utilisateur', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  const invitation = await prisma.invitation.create({
    data: {
      scope: 'event',
      targetId: eventId,
      invitedEmail: 'bob@example.test',
      invitedBy: await userId(alice),
    },
  })

  const response = await accept(invitation.id, bob)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ eventId })

  const reread = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })
  expect(reread.status).toBe('accepted')
})

it('refuse une invitation nominative à un autre utilisateur', async () => {
  const alice = await signIn('alice@example.test')
  const carla = await signIn('carla@example.test')
  const eventId = await makeEvent(alice)
  const invitation = await prisma.invitation.create({
    data: {
      scope: 'event',
      targetId: eventId,
      invitedEmail: 'bob@example.test',
      invitedBy: await userId(alice),
    },
  })

  const response = await accept(invitation.id, carla)
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'invitation_not_yours' })

  const reread = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })
  expect(reread.status).toBe('pending')
})

it('répond 404 sur un jeton inconnu', async () => {
  const bob = await signIn('bob@example.test')
  const response = await accept('inconnu', bob)
  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'invitation_not_found' })
})

it('supporte deux acceptations concurrentes du même lien', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  const bobId = await userId(bob)
  const token = await makeLink(eventId, await userId(alice))

  // Le service est appelé directement, pas par HTTP : la pile HTTP intercale assez
  // d'attentes pour que la course ne se produise qu'au hasard, et un test qui ne échoue
  // qu'une fois sur dix ne prouve rien. Ici les deux lectures « suis-je déjà
  // participant ? » se résolvent avant la première écriture de façon déterministe. Sans
  // écriture atomique, la seconde insertion heurte la contrainte d'unicité et l'appelant
  // reçoit un 500 sur un simple double-clic.
  const results = await Promise.allSettled([
    acceptInvitation({ id: bobId, email: 'bob@example.test' }, token),
    acceptInvitation({ id: bobId, email: 'bob@example.test' }, token),
  ])

  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled'])

  const rows = await prisma.eventParticipant.findMany({ where: { eventId, userId: bobId } })
  expect(rows).toHaveLength(1)
})
