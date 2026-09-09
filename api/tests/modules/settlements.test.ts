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

// Bob doit 5,00 € à Alice et le déclare envoyé. Le point de départ de presque tous les
// tests de ce fichier.
async function declaredSettlement() {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')

  const response = await send('POST', `/api/events/${eventId}/settlements`, bob, {
    toParticipantId: await participantIdOf(eventId, alice),
    amountCents: 500,
  })

  const { settlement } = (await response.json()) as { settlement: { id: string } }

  return { alice, bob, eventId, settlementId: settlement.id }
}

it('déclare un virement, puis le créancier le confirme', async () => {
  const { alice, settlementId } = await declaredSettlement()

  const confirmed = await send('POST', `/api/settlements/${settlementId}/confirm`, alice)

  expect(confirmed.status).toBe(200)

  const { settlement } = (await confirmed.json()) as { settlement: { confirmedAt: string | null } }

  expect(settlement.confirmedAt).not.toBeNull()
})

it('rend un règlement non confirmé à la déclaration', async () => {
  const { settlementId } = await declaredSettlement()

  const settlement = await prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } })

  expect(settlement.confirmedAt).toBeNull()
})

// La moitié de §3.6 qui protège du litige : celui qui doit ne peut pas décider seul qu'il
// a payé.
it('refuse au débiteur de confirmer son propre virement', async () => {
  const { bob, settlementId } = await declaredSettlement()

  const response = await send('POST', `/api/settlements/${settlementId}/confirm`, bob)

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'forbidden' })
})

// Deux clics sur un réseau lent ne doivent pas produire un 409 incompréhensible : la
// première date fait foi.
it('accepte une seconde confirmation sans rien changer', async () => {
  const { alice, settlementId } = await declaredSettlement()

  const first = await send('POST', `/api/settlements/${settlementId}/confirm`, alice)
  const second = await send('POST', `/api/settlements/${settlementId}/confirm`, alice)

  expect(second.status).toBe(200)

  const firstBody = (await first.json()) as { settlement: { confirmedAt: string } }
  const secondBody = (await second.json()) as { settlement: { confirmedAt: string } }

  expect(secondBody.settlement.confirmedAt).toBe(firstBody.settlement.confirmedAt)
})

// Le débiteur est toujours l'appelant : on ne déclare pas un paiement au nom d'un autre.
it('ignore un débiteur soufflé dans le corps de la requête', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')
  const bobId = await participantIdOf(eventId, bob)

  const response = await send('POST', `/api/events/${eventId}/settlements`, alice, {
    toParticipantId: bobId,
    amountCents: 500,
    fromParticipantId: bobId,
  })

  const { settlement } = (await response.json()) as { settlement: { fromParticipantId: string } }

  expect(settlement.fromParticipantId).toBe(await participantIdOf(eventId, alice))
})

it('refuse un virement vers soi-même', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const response = await send('POST', `/api/events/${eventId}/settlements`, alice, {
    toParticipantId: await participantIdOf(eventId, alice),
    amountCents: 500,
  })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'self_settlement' })
})

it("refuse un bénéficiaire étranger à l'événement", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const response = await send('POST', `/api/events/${eventId}/settlements`, alice, {
    toParticipantId: 'inconnu',
    amountCents: 500,
  })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'unknown_creditor' })
})

// Sans retrait, une déclaration erronée resterait inconfirmable à vie : un état bloqué,
// qu'aucune machine à états de cette application n'a le droit de produire.
it('laisse le débiteur retirer une déclaration non confirmée', async () => {
  const { bob, settlementId } = await declaredSettlement()

  expect((await send('DELETE', `/api/settlements/${settlementId}`, bob)).status).toBe(200)
  expect(await prisma.settlement.findUnique({ where: { id: settlementId } })).toBeNull()
})

it('refuse le retrait à qui n’est pas le débiteur', async () => {
  const { alice, settlementId } = await declaredSettlement()

  const response = await send('DELETE', `/api/settlements/${settlementId}`, alice)

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'forbidden' })
})

// Après confirmation, un règlement est un fait : il se corrige par un virement inverse,
// pas par une suppression.
it('refuse de retirer un règlement déjà confirmé', async () => {
  const { alice, bob, settlementId } = await declaredSettlement()
  await send('POST', `/api/settlements/${settlementId}/confirm`, alice)

  const response = await send('DELETE', `/api/settlements/${settlementId}`, bob)

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'settlement_already_confirmed' })
})

it('rend 404 sur un règlement inconnu', async () => {
  const alice = await signIn('alice@example.test')
  await makeEvent(alice)

  const response = await send(
    'POST',
    '/api/settlements/00000000-0000-4000-8000-000000000000/confirm',
    alice,
  )

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'settlement_not_found' })
})

it('diffuse settlement.declared puis settlement.confirmed', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)
  await addParticipant(bob, eventId, 'accepted')

  const received: ServerEvent[] = []
  const unsubscribe = subscribe(eventId, (event) => received.push(event))

  const declared = await send('POST', `/api/events/${eventId}/settlements`, bob, {
    toParticipantId: await participantIdOf(eventId, alice),
    amountCents: 500,
  })
  const { settlement } = (await declared.json()) as { settlement: { id: string } }

  await send('POST', `/api/settlements/${settlement.id}/confirm`, alice)

  unsubscribe()

  expect(received).toEqual([
    { type: 'settlement.declared', id: settlement.id },
    { type: 'settlement.confirmed', id: settlement.id },
  ])
})
