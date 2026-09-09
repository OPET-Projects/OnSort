import { expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { type ServerEvent, subscribe } from '../../src/lib/sse.ts'
import { hashInviteToken } from '../../src/lib/tokens.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

const period = {
  startsAt: '2026-10-01T18:00:00.000Z',
  endsAt: '2026-10-01T22:00:00.000Z',
}

async function send(method: string, path: string, headers: Headers, body: unknown) {
  return app.request(path, {
    method,
    headers: new Headers([...headers, ['content-type', 'application/json']]),
    body: JSON.stringify(body),
  })
}

async function post(path: string, headers: Headers, body: unknown) {
  return send('POST', path, headers, body)
}

// Rend l'identifiant de la **participation** créée, celui que porte le flux temps réel.
async function addMember(headers: Headers, eventId: string) {
  const me = await app.request('/api/me', { headers })
  const { user } = (await me.json()) as { user: { id: string } }
  const participant = await prisma.eventParticipant.create({
    data: { eventId, userId: user.id },
  })
  return participant.id
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
    event: {
      participants: { email: string }[]
      viewer: { participantId: string; role: string }
    }
  }
  expect(event.participants[0]?.email).toBe('alice@example.test')
  expect(event.viewer.role).toBe('admin')
  expect(event.viewer.participantId).toEqual(expect.any(String))
})

it('interdit la modification à un simple participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }
  await addMember(bob, id)

  const response = await send('PATCH', `/api/events/${id}`, bob, { title: 'Piraté' })
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'forbidden' })
})

it('laisse l’administrateur changer le titre', async () => {
  const alice = await signIn('alice@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  const response = await send('PATCH', `/api/events/${id}`, alice, { title: 'Nouveau titre' })
  expect(response.status).toBe(200)
  const event = await prisma.event.findUniqueOrThrow({ where: { id } })
  expect(event.title).toBe('Nouveau titre')
})

it('rejette une modification qui inverse la période', async () => {
  const alice = await signIn('alice@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  const response = await send('PATCH', `/api/events/${id}`, alice, {
    startsAt: '2026-10-02T23:00:00.000Z',
  })
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'invalid_period' })
})

it('autorise le retour à un état antérieur (aucun état absorbant)', async () => {
  const alice = await signIn('alice@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  expect((await send('PATCH', `/api/events/${id}`, alice, { status: 'closed' })).status).toBe(200)
  expect((await send('PATCH', `/api/events/${id}`, alice, { status: 'draft' })).status).toBe(200)
  const event = await prisma.event.findUniqueOrThrow({ where: { id } })
  expect(event.status).toBe('draft')
})

it('enregistre un refus sans supprimer la ligne de participation', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }
  await addMember(bob, id)

  const response = await post(`/api/events/${id}/rsvp`, bob, { rsvp: 'declined' })
  expect(response.status).toBe(200)

  const rows = await prisma.eventParticipant.findMany({ where: { eventId: id } })
  expect(rows).toHaveLength(2)
  expect(rows.find((r) => r.userId !== null && r.role === 'member')?.rsvp).toBe('declined')
})

it('refuse le RSVP d’un non-participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  const response = await post(`/api/events/${id}/rsvp`, bob, { rsvp: 'accepted' })
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'not_a_participant' })
})

it('interdit l’émission d’une invitation à un simple participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }
  await addMember(bob, id)

  const response = await post(`/api/events/${id}/invitations`, bob, { kind: 'link' })
  expect(response.status).toBe(403)
})

it('crée un lien partageable dont seul le hachage est stocké', async () => {
  const alice = await signIn('alice@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  const response = await post(`/api/events/${id}/invitations`, alice, { kind: 'link' })
  expect(response.status).toBe(200)
  const { url } = (await response.json()) as { url: string }
  const token = url.split('/invite/')[1] ?? ''

  const link = await prisma.inviteLink.findFirstOrThrow({ where: { targetId: id } })
  expect(link.tokenHash).toBe(hashInviteToken(token))
  expect(link.expiresAt).toBeNull()
})

it('applique une expiration au lien quand elle est demandée', async () => {
  const alice = await signIn('alice@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  await post(`/api/events/${id}/invitations`, alice, { kind: 'link', expiresInHours: 48 })
  const link = await prisma.inviteLink.findFirstOrThrow({ where: { targetId: id } })

  if (link.expiresAt === null) {
    throw new Error('Le lien devrait porter une date d’expiration.')
  }
  const hours = (link.expiresAt.getTime() - Date.now()) / 3_600_000
  expect(hours).toBeGreaterThan(47)
  expect(hours).toBeLessThan(49)
})

it('répond à l’identique pour une adresse connue et une adresse inconnue', async () => {
  const alice = await signIn('alice@example.test')
  await signIn('known@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }

  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  try {
    const known = await post(`/api/events/${id}/invitations`, alice, {
      kind: 'email',
      email: 'known@example.test',
    })
    const unknown = await post(`/api/events/${id}/invitations`, alice, {
      kind: 'email',
      email: 'nobody@example.test',
    })

    expect(known.status).toBe(unknown.status)
    expect(await known.json()).toEqual(await unknown.json())

    const invitations = await prisma.invitation.findMany({
      where: { targetId: id },
      orderBy: { createdAt: 'asc' },
    })
    expect(invitations[0]?.invitedUserId).not.toBeNull()
    expect(invitations[0]?.invitedEmail).toBeNull()
    expect(invitations[1]?.invitedUserId).toBeNull()
    expect(invitations[1]?.invitedEmail).toBe('nobody@example.test')

    const logged = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(logged).toContain('/invite/')
  } finally {
    infoSpy.mockRestore()
  }
})

it('diffuse le changement de réponse d’un participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const { id } = (await (await createEvent(alice)).json()) as { id: string }
  const participantId = await addMember(bob, id)

  const received: ServerEvent[] = []
  const unsubscribe = subscribe(id, (event) => received.push(event))

  try {
    await post(`/api/events/${id}/rsvp`, bob, { rsvp: 'accepted' })
  } finally {
    unsubscribe()
  }

  // `participant.rsvp` figure dans les types de la conception §5.2 : l'écran du créateur
  // doit voir la réponse arriver sans rechargement.
  expect(received).toEqual([{ type: 'participant.rsvp', id: participantId }])
})

// Revenir à « je ne sais pas » doit rester possible : aucun état de réponse n'est absorbant.
it.each([['accepted'], ['invited'], ['declined']] as const)(
  'accepte la réponse %s',
  async (rsvp) => {
    const alice = await signIn('alice@example.test')
    const created = await createEvent(alice)
    const { id: eventId } = (await created.json()) as { id: string }

    const response = await post(`/api/events/${eventId}/rsvp`, alice, { rsvp })

    expect(response.status).toBe(200)

    const participant = await prisma.eventParticipant.findFirstOrThrow({ where: { eventId } })
    expect(participant.rsvp).toBe(rsvp)
  },
)
