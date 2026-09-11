import { expect, it } from 'vitest'
import { prisma } from '../../src/db.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

// Saisie d'une dépense dans les trois modes de partage (conception §2.8 note 3, §3.5).
// L'invariant `SUM(parts) = montant` est vérifié **en base**, pas sur la réponse : c'est lui
// qui permet à `computeBalances` de ne rien savoir du mode.

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

async function addParticipant(headers: Headers, eventId: string, rsvp: 'invited' | 'accepted') {
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

async function sharesOf(expenseId: string) {
  return prisma.expenseShare.findMany({
    where: { expenseId },
    orderBy: { participantId: 'asc' },
  })
}

async function setUp() {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')

  return {
    alice,
    bob,
    eventId,
    aliceId: await participantIdOf(eventId, alice),
    bobId: await participantIdOf(eventId, bob),
  }
}

it('partage en pourcentage et tient l’invariant en base', async () => {
  const { alice, eventId, aliceId, bobId } = await setUp()

  const response = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Hôtel',
    amountCents: 10_001,
    splitMode: 'percent',
    shares: [
      { participantId: aliceId, percent: 70 },
      { participantId: bobId, percent: 30 },
    ],
  })

  expect(response.status).toBe(201)

  const { id } = (await response.json()) as { id: string }
  const shares = await sharesOf(id)
  const total = shares.reduce((sum, share) => sum + share.amountCents, 0)

  expect(total).toBe(10_001)
  expect(shares).toHaveLength(2)
  // 70 % de 10 001 centimes, au centime d'arrondi près : sûrement pas la moitié.
  expect(
    shares.find((share) => share.participantId === aliceId)?.amountCents,
  ).toBeGreaterThanOrEqual(7000)

  const expense = await prisma.expense.findUniqueOrThrow({ where: { id } })
  expect(expense.splitMode).toBe('percent')
})

it('partage en montant fixe et tient l’invariant en base', async () => {
  const { alice, eventId, aliceId, bobId } = await setUp()

  const response = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Courses',
    amountCents: 5000,
    splitMode: 'fixed',
    shares: [
      { participantId: aliceId, amountCents: 3500 },
      { participantId: bobId, amountCents: 1500 },
    ],
  })

  expect(response.status).toBe(201)

  const { id } = (await response.json()) as { id: string }
  const shares = await sharesOf(id)

  expect(shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(5000)
  expect(shares.find((share) => share.participantId === aliceId)?.amountCents).toBe(3500)
})

it('partage à parts égales sans rien de plus', async () => {
  const { alice, eventId } = await setUp()

  const response = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Taxi',
    amountCents: 1001,
  })

  expect(response.status).toBe(201)

  const { id } = (await response.json()) as { id: string }
  expect((await sharesOf(id)).reduce((sum, share) => sum + share.amountCents, 0)).toBe(1001)
})

it('refuse un mode pourcentage sans pourcentages', async () => {
  const { alice, eventId } = await setUp()

  const response = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Hôtel',
    amountCents: 10_000,
    splitMode: 'percent',
  })

  expect(response.status).toBe(400)
})

it('refuse des pourcentages qui ne totalisent pas 100', async () => {
  const { alice, eventId, aliceId, bobId } = await setUp()

  const response = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Hôtel',
    amountCents: 10_000,
    splitMode: 'percent',
    shares: [
      { participantId: aliceId, percent: 70 },
      { participantId: bobId, percent: 20 },
    ],
  })

  expect(response.status).toBe(400)
  expect((await response.json()) as { code: string }).toMatchObject({ code: 'invalid_split' })
})

it('refuse des montants fixes dont la somme n’est pas le total', async () => {
  const { alice, eventId, aliceId, bobId } = await setUp()

  const response = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Courses',
    amountCents: 5000,
    splitMode: 'fixed',
    shares: [
      { participantId: aliceId, amountCents: 3000 },
      { participantId: bobId, amountCents: 1500 },
    ],
  })

  expect(response.status).toBe(400)
  expect((await response.json()) as { code: string }).toMatchObject({ code: 'invalid_split' })
})

// Même règle qu'en M3 : un bénéficiaire étranger à l'événement est refusé, quel que soit le
// mode de partage.
it('refuse un bénéficiaire étranger à l’événement', async () => {
  const { alice, eventId, aliceId } = await setUp()

  const response = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Hôtel',
    amountCents: 10_000,
    splitMode: 'percent',
    shares: [
      { participantId: aliceId, percent: 50 },
      { participantId: 'inconnu', percent: 50 },
    ],
  })

  expect(response.status).toBe(400)
  expect((await response.json()) as { code: string }).toMatchObject({
    code: 'unknown_beneficiary',
  })
})

it('rejoue le mode de la dépense à sa correction', async () => {
  const { alice, eventId, aliceId, bobId } = await setUp()

  const created = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Hôtel',
    amountCents: 10_000,
    splitMode: 'percent',
    shares: [
      { participantId: aliceId, percent: 70 },
      { participantId: bobId, percent: 30 },
    ],
  })

  const { id } = (await created.json()) as { id: string }

  const updated = await send('PATCH', `/api/expenses/${id}`, alice, {
    amountCents: 20_000,
    splitMode: 'percent',
    shares: [
      { participantId: aliceId, percent: 50 },
      { participantId: bobId, percent: 50 },
    ],
  })

  expect(updated.status).toBe(200)

  const shares = await sharesOf(id)
  expect(shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(20_000)
  expect(shares.find((share) => share.participantId === aliceId)?.amountCents).toBe(10_000)
})

// Changer le montant d'une dépense en pourcentage sans redonner les pourcentages laisserait
// le service deviner : les parts sont stockées en valeur absolue, pas en pourcentage.
it('refuse de changer le montant d’une dépense en pourcentage sans ses pourcentages', async () => {
  const { alice, eventId, aliceId, bobId } = await setUp()

  const created = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Hôtel',
    amountCents: 10_000,
    splitMode: 'percent',
    shares: [
      { participantId: aliceId, percent: 70 },
      { participantId: bobId, percent: 30 },
    ],
  })

  const { id } = (await created.json()) as { id: string }

  const updated = await send('PATCH', `/api/expenses/${id}`, alice, { amountCents: 20_000 })

  expect(updated.status).toBe(400)
  expect((await updated.json()) as { code: string }).toMatchObject({ code: 'shares_required' })
})

// Corriger le libellé seul ne touche ni au mode ni aux parts figées.
it('laisse les parts intactes quand seul le libellé change', async () => {
  const { alice, eventId, aliceId, bobId } = await setUp()

  const created = await send('POST', `/api/events/${eventId}/expenses`, alice, {
    label: 'Hôtel',
    amountCents: 10_000,
    splitMode: 'fixed',
    shares: [
      { participantId: aliceId, amountCents: 7000 },
      { participantId: bobId, amountCents: 3000 },
    ],
  })

  const { id } = (await created.json()) as { id: string }
  const updated = await send('PATCH', `/api/expenses/${id}`, alice, { label: 'Hôtel du port' })

  expect(updated.status).toBe(200)

  const shares = await sharesOf(id)
  expect(shares.find((share) => share.participantId === aliceId)?.amountCents).toBe(7000)
  expect(shares.find((share) => share.participantId === bobId)?.amountCents).toBe(3000)
})
