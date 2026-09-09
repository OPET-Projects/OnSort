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

async function makeEvent(headers: Headers): Promise<string> {
  const response = await send('POST', '/api/events', headers, {
    title: 'Week-end',
    startsAt: '2026-10-01T18:00:00.000Z',
    endsAt: '2026-10-03T22:00:00.000Z',
  })
  return ((await response.json()) as { id: string }).id
}

async function addParticipant(headers: Headers, eventId: string) {
  await prisma.eventParticipant.create({
    data: { eventId, userId: await userId(headers), rsvp: 'accepted' },
  })
}

async function participantIdOf(eventId: string, headers: Headers): Promise<string> {
  const participant = await prisma.eventParticipant.findFirstOrThrow({
    where: { eventId, userId: await userId(headers) },
  })
  return participant.id
}

const spend = (headers: Headers, eventId: string, amountCents: number) =>
  send('POST', `/api/events/${eventId}/expenses`, headers, { label: 'Taxi', amountCents })

type Balances = {
  balances: { participantId: string; name: string; balanceCents: number; you: boolean }[]
  transfers: { fromParticipantId: string; toParticipantId: string; amountCents: number }[]
  pendingSettlements: { id: string; amountCents: number }[]
}

const readBalances = async (headers: Headers, eventId: string): Promise<Balances> => {
  const response = await app.request(`/api/events/${eventId}/balances`, { headers })
  return (await response.json()) as Balances
}

it('dérive les soldes et propose les virements', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId)
  await spend(alice, eventId, 1000)

  const { balances, transfers } = await readBalances(bob, eventId)

  expect(balances.reduce((sum, balance) => sum + balance.balanceCents, 0)).toBe(0)
  expect(transfers).toHaveLength(1)
  expect(transfers[0]?.amountCents).toBe(500)
  expect(transfers[0]?.fromParticipantId).toBe(await participantIdOf(eventId, bob))
})

it('marque le solde de l’appelant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId)
  await spend(alice, eventId, 1000)

  const { balances } = await readBalances(bob, eventId)

  expect(balances.find((balance) => balance.you)?.balanceCents).toBe(-500)
})

// Compter une déclaration donnerait au débiteur le pouvoir d'effacer sa dette seul —
// exactement ce que les deux états de §3.6 refusent.
it("n'entre un règlement dans le solde qu'une fois confirmé", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId)
  await spend(alice, eventId, 1000)

  const declared = await send('POST', `/api/events/${eventId}/settlements`, bob, {
    toParticipantId: await participantIdOf(eventId, alice),
    amountCents: 500,
  })
  const { settlement } = (await declared.json()) as { settlement: { id: string } }

  const pending = await readBalances(bob, eventId)

  expect(pending.balances.find((balance) => balance.you)?.balanceCents).toBe(-500)
  expect(pending.pendingSettlements).toHaveLength(1)

  await send('POST', `/api/settlements/${settlement.id}/confirm`, alice)

  const settled = await readBalances(bob, eventId)

  expect(settled.balances.every((balance) => balance.balanceCents === 0)).toBe(true)
  expect(settled.transfers).toEqual([])
  expect(settled.pendingSettlements).toEqual([])
})

it('rend des soldes nuls sans dépense', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const { balances, transfers } = await readBalances(alice, eventId)

  expect(balances).toHaveLength(1)
  expect(balances[0]?.balanceCents).toBe(0)
  expect(transfers).toEqual([])
})

// La démonstration du jalon, bout en bout : quatre personnes, trois dépenses, et moins de
// virements que de paires.
it('propose au plus N−1 virements pour quatre participants', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const carol = await signIn('carol@example.test')
  const dan = await signIn('dan@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId)
  await addParticipant(carol, eventId)
  await addParticipant(dan, eventId)

  await spend(alice, eventId, 9000)
  await spend(bob, eventId, 3000)
  await spend(carol, eventId, 400)

  const { balances, transfers } = await readBalances(alice, eventId)

  expect(balances.reduce((sum, balance) => sum + balance.balanceCents, 0)).toBe(0)
  expect(transfers.length).toBeLessThanOrEqual(3)
})

it('refuse la lecture à un non-participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)

  const response = await app.request(`/api/events/${eventId}/balances`, { headers: bob })

  expect(response.status).toBe(403)
})
