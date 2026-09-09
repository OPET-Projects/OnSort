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

const day = (n: number, hour = 0) => new Date(Date.UTC(2026, 9, n, hour)).toISOString()

const add = (headers: Headers, startsAt: string, endsAt: string, label?: string) =>
  send('POST', '/api/me/unavailability', headers, { startsAt, endsAt, label })

const list = (headers: Headers, query = '') =>
  app.request(`/api/me/unavailability${query}`, { headers })

type Row = { id: string; startsAt: string; endsAt: string; label: string | null }

const rowsOf = async (response: Response) =>
  ((await response.json()) as { unavailability: Row[] }).unavailability

it('refuse sans session', async () => {
  expect((await app.request('/api/me/unavailability')).status).toBe(401)
})

it('enregistre une indisponibilité et la relit', async () => {
  const alice = await signIn('alice@example.test')

  const created = await add(alice, day(1), day(2), 'Congés')

  expect(created.status).toBe(201)

  const rows = await rowsOf(await list(alice))

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ startsAt: day(1), endsAt: day(2), label: 'Congés' })
})

// L'invariant de non-superposition de §2.4, tenu en couche service faute de contrainte
// `EXCLUDE` : deux saisies qui se touchent deviennent une seule ligne.
it('fusionne deux plages qui se touchent', async () => {
  const alice = await signIn('alice@example.test')

  await add(alice, day(1), day(2))
  await add(alice, day(2), day(3))

  const rows = await rowsOf(await list(alice))

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ startsAt: day(1), endsAt: day(3) })
})

it('fusionne deux plages qui se recouvrent', async () => {
  const alice = await signIn('alice@example.test')

  await add(alice, day(1), day(3))
  await add(alice, day(2), day(5))

  const rows = await rowsOf(await list(alice))

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ startsAt: day(1), endsAt: day(5) })
})

it('laisse deux plages disjointes séparées', async () => {
  const alice = await signIn('alice@example.test')

  await add(alice, day(1), day(2))
  await add(alice, day(5), day(6))

  expect(await rowsOf(await list(alice))).toHaveLength(2)
})

// Une saisie déjà couverte ne doit pas rétrécir la plage existante.
it('absorbe une plage contenue dans une autre', async () => {
  const alice = await signIn('alice@example.test')

  await add(alice, day(1), day(10))
  await add(alice, day(3), day(4))

  const rows = await rowsOf(await list(alice))

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ startsAt: day(1), endsAt: day(10) })
})

it('fusionne en cascade trois plages qui se rejoignent', async () => {
  const alice = await signIn('alice@example.test')

  await add(alice, day(1), day(2))
  await add(alice, day(3), day(4))
  await add(alice, day(2), day(3))

  const rows = await rowsOf(await list(alice))

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ startsAt: day(1), endsAt: day(4) })
})

it.each([
  ['inversée', day(2), day(1)],
  ['vide', day(1), day(1)],
])('refuse une plage %s', async (_label, startsAt, endsAt) => {
  const alice = await signIn('alice@example.test')

  const response = await add(alice, startsAt, endsAt)

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'invalid_period' })
})

it('borne la lecture par une fenêtre', async () => {
  const alice = await signIn('alice@example.test')
  await add(alice, day(1), day(2))
  await add(alice, day(20), day(21))

  const rows = await rowsOf(await list(alice, `?from=${day(15)}&to=${day(25)}`))

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ startsAt: day(20) })
})

it('ne rend que ses propres indisponibilités', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await add(alice, day(1), day(2))

  expect(await rowsOf(await list(bob))).toEqual([])
})

it('supprime sa propre plage', async () => {
  const alice = await signIn('alice@example.test')
  await add(alice, day(1), day(2))
  const [row] = await rowsOf(await list(alice))

  const response = await send('DELETE', `/api/me/unavailability/${row?.id}`, alice)

  expect(response.status).toBe(200)
  expect(await rowsOf(await list(alice))).toEqual([])
})

// 404 et non 403 : répondre « interdit » confirmerait que cette plage existe, et le
// calendrier de quelqu'un d'autre ne se devine pas.
it("rend 404 sur la plage d'autrui", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  await add(alice, day(1), day(2))
  const [row] = await rowsOf(await list(alice))

  const response = await send('DELETE', `/api/me/unavailability/${row?.id}`, bob)

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'unavailability_not_found' })
  expect(await prisma.unavailability.count()).toBe(1)
})
