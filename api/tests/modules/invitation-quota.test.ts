import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { INVITATION_QUOTA } from '../../src/lib/invitation-quota.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

// Trois routes envoient un courriel vers une adresse choisie par l'appelant. Sans plafond,
// un seul compte ferait de l'application un relais de spam sous notre domaine.

afterEach(() => {
  vi.restoreAllMocks()
})

let alice: Headers
let eventId: string
let groupId: string

beforeEach(async () => {
  alice = await signIn('alice@example.test')
  // Les courriels partent sur la console sans clé Resend : on la fait taire.
  vi.spyOn(console, 'info').mockImplementation(() => {})

  const event = await post('/api/events', alice, {
    title: 'Sortie',
    startsAt: '2026-10-01T18:00:00.000Z',
    endsAt: '2026-10-01T23:00:00.000Z',
  })
  eventId = ((await event.json()) as { id: string }).id

  const group = await post('/api/groups', alice, { name: 'Les copains' })
  groupId = ((await group.json()) as { id: string }).id
})

function post(path: string, headers: Headers, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: new Headers([...headers, ['content-type', 'application/json']]),
    body: JSON.stringify(body),
  })
}

const inviteToEvent = (index: number) =>
  post(`/api/events/${eventId}/invitations`, alice, {
    kind: 'email',
    email: `invite-${index}@example.test`,
  })

async function exhaustQuota() {
  for (let index = 0; index < INVITATION_QUOTA; index += 1) {
    expect((await inviteToEvent(index)).status).toBe(200)
  }
}

it('refuse la vingt et unième invitation à une sortie', async () => {
  await exhaustQuota()

  const response = await inviteToEvent(INVITATION_QUOTA)

  expect(response.status).toBe(429)
  expect(((await response.json()) as { code: string }).code).toBe('too_many_invitations')
})

it('partage le plafond entre sorties, groupes et amis', async () => {
  await exhaustQuota()

  const group = await post(`/api/groups/${groupId}/members`, alice, {
    email: 'groupe@example.test',
  })
  const friend = await post('/api/friends/requests', alice, { email: 'ami@example.test' })

  expect(group.status).toBe(429)
  expect(friend.status).toBe(429)
})

it('ne compte pas un lien partageable, qui n’envoie aucun courriel', async () => {
  await exhaustQuota()

  const link = await post(`/api/events/${eventId}/invitations`, alice, { kind: 'link' })

  expect(link.status).toBe(200)
})

it('laisse les autres comptes inviter', async () => {
  await exhaustQuota()
  vi.restoreAllMocks()
  const bob = await signIn('bob@example.test')
  vi.spyOn(console, 'info').mockImplementation(() => {})

  const response = await post('/api/friends/requests', bob, { email: 'carla@example.test' })

  expect(response.status).not.toBe(429)
})
