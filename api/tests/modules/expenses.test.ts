import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { type ServerEvent, subscribe } from '../../src/lib/sse.ts'
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

async function participantIdOf(eventId: string, headers: Headers): Promise<string> {
  const participant = await prisma.eventParticipant.findFirstOrThrow({
    where: { eventId, userId: await userId(headers) },
  })
  return participant.id
}

const record = (headers: Headers, eventId: string, body: Record<string, unknown> = {}) =>
  send('POST', `/api/events/${eventId}/expenses`, headers, {
    label: 'Taxi',
    amountCents: 1000,
    ...body,
  })

const listExpenses = (headers: Headers, eventId: string) =>
  app.request(`/api/events/${eventId}/expenses`, { headers })

it('fige les parts à la saisie et rend 201', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')

  // 1001 centimes entre deux personnes : le reste d'un centime doit atterrir quelque part.
  const response = await record(alice, eventId, { amountCents: 1001 })

  expect(response.status).toBe(201)

  const { expenses } = (await (await listExpenses(bob, eventId)).json()) as {
    expenses: { amountCents: number; shares: { amountCents: number }[] }[]
  }

  expect(expenses).toHaveLength(1)
  expect(expenses[0].amountCents).toBe(1001)
  expect(expenses[0].shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(1001)
})

it('partage entre tous ceux qui ont accepté, et eux seuls', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carol = await signIn('carol@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  await addParticipant(carol, eventId, 'invited')

  await record(alice, eventId, { amountCents: 1000 })

  const { expenses } = (await (await listExpenses(alice, eventId)).json()) as {
    expenses: { shares: unknown[] }[]
  }

  expect(expenses[0].shares).toHaveLength(2)
})

it('partage entre les bénéficiaires demandés quand la liste est fournie', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')

  const response = await record(alice, eventId, {
    amountCents: 600,
    beneficiaryIds: [await participantIdOf(eventId, alice)],
  })

  const { expense } = (await response.json()) as {
    expense: { shares: { amountCents: number }[] }
  }

  expect(expense.shares).toHaveLength(1)
  expect(expense.shares[0].amountCents).toBe(600)
})

it.each([['invited'], ['declined']] as const)(
  'refuse la saisie à un participant %s',
  async (rsvp) => {
    const alice = await signIn('alice@example.test')
    const carol = await signIn('carol@example.test')
    const eventId = await makeEvent(alice)
    await addParticipant(carol, eventId, rsvp)

    const response = await record(carol, eventId)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'must_accept_first' })
  },
)

it("refuse la saisie d'un non-participant", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)

  const response = await record(bob, eventId)

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'not_a_participant' })
})

it.each([[0], [-100], [10.5]])('refuse le montant %s', async (amountCents) => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const response = await record(alice, eventId, { amountCents })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'validation_error' })
})

it("refuse un bénéficiaire étranger à l'événement", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const response = await record(alice, eventId, { beneficiaryIds: ['inconnu'] })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'unknown_beneficiary' })
})

// Savoir ce que la sortie coûte aide à décider si l'on vient : la lecture est ouverte à
// tout participant, y compris celui qui n'a pas encore répondu.
it('laisse un invité non répondant consulter la liste', async () => {
  const alice = await signIn('alice@example.test')
  const carol = await signIn('carol@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(carol, eventId, 'invited')

  expect((await listExpenses(carol, eventId)).status).toBe(200)
})

it('refuse la lecture à un non-participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)

  expect((await listExpenses(bob, eventId)).status).toBe(403)
})

it('diffuse expense.created', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const received: ServerEvent[] = []
  const unsubscribe = subscribe(eventId, (event) => received.push(event))

  const response = await record(alice, eventId)
  const { id } = (await response.json()) as { id: string }

  unsubscribe()

  expect(received).toEqual([{ type: 'expense.created', id }])
})

const patchExpense = (headers: Headers, expenseId: string, body: Record<string, unknown>) =>
  send('PATCH', `/api/expenses/${expenseId}`, headers, body)

async function recordedExpense(headers: Headers, eventId: string): Promise<string> {
  const response = await record(headers, eventId)
  return ((await response.json()) as { id: string }).id
}

// Figer les parts protège une dépense passée d'un changement de présence, pas de la
// correction de la dépense elle-même : laisser les anciennes parts sur un nouveau montant
// casserait SUM(parts) = montant.
it("recalcule les parts quand le montant change et tient l'invariant", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  const expenseId = await recordedExpense(alice, eventId)

  const response = await patchExpense(alice, expenseId, { amountCents: 1001 })

  expect(response.status).toBe(200)

  const { expense } = (await response.json()) as {
    expense: { amountCents: number; shares: { amountCents: number }[] }
  }

  expect(expense.amountCents).toBe(1001)
  expect(expense.shares).toHaveLength(2)
  expect(expense.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(1001)
})

it('laisse un administrateur corriger la dépense de quelqu’un d’autre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  const expenseId = await recordedExpense(bob, eventId)

  expect((await patchExpense(alice, expenseId, { label: 'Taxi partagé' })).status).toBe(200)
})

it("refuse la correction à un participant qui n'en est ni l'auteur ni administrateur", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  const expenseId = await recordedExpense(alice, eventId)

  const response = await patchExpense(bob, expenseId, { label: 'Autre' })

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'forbidden' })
})

it('rend 404 sur une dépense inconnue', async () => {
  const alice = await signIn('alice@example.test')
  await makeEvent(alice)

  const response = await patchExpense(alice, '00000000-0000-4000-8000-000000000000', {
    label: 'Fantôme',
  })

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'expense_not_found' })
})

it('diffuse expense.updated', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const expenseId = await recordedExpense(alice, eventId)

  const received: ServerEvent[] = []
  const unsubscribe = subscribe(eventId, (event) => received.push(event))

  await patchExpense(alice, expenseId, { label: 'Taxi partagé' })

  unsubscribe()

  expect(received).toEqual([{ type: 'expense.updated', id: expenseId }])
})
