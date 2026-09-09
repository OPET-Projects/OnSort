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

async function makeGroup(headers: Headers): Promise<string> {
  const response = await send('POST', '/api/groups', headers, { name: 'Les copains' })
  return ((await response.json()) as { id: string }).id
}

const day = (n: number, hour = 0) => new Date(Date.UTC(2026, 9, n, hour)).toISOString()

const busy = (headers: Headers, startsAt: string, endsAt: string, label?: string) =>
  send('POST', '/api/me/unavailability', headers, { startsAt, endsAt, label })

type Calendar = {
  busy: { userId: string; name: string; startsAt: string; endsAt: string }[]
  free: { startsAt: string; endsAt: string }[]
  viewer: { role: string }
}

const calendar = (headers: Headers, groupId: string, query: string) =>
  app.request(`/api/groups/${groupId}/calendar${query}`, { headers })

const window30 = `?from=${day(1)}&to=${day(30)}`

it('rend la fenêtre entière quand personne n’est occupé', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const body = (await (await calendar(alice, groupId, window30)).json()) as Calendar

  expect(body.free).toHaveLength(1)
  expect(body.free[0]).toMatchObject({ startsAt: day(1), endsAt: day(30) })
  expect(body.busy).toEqual([])
})

// La démonstration du jalon : deux membres occupés à des moments différents laissent le
// créneau qui convient à tous.
it('fait apparaître le créneau qui convient à tous', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await prisma.groupMember.create({ data: { groupId, userId: await userId(bob) } })

  await busy(alice, day(1), day(10))
  await busy(bob, day(15), day(30))

  const body = (await (await calendar(alice, groupId, window30)).json()) as Calendar

  expect(body.free).toHaveLength(1)
  expect(body.free[0]).toMatchObject({ startsAt: day(10), endsAt: day(15) })
  expect(body.busy).toHaveLength(2)
})

// `label` est **privé** (§2.4) : le groupe voit « occupé », jamais la raison. L'assertion
// porte sur le corps brut, pour attraper aussi une clé oubliée dans un objet imbriqué.
it('ne laisse jamais fuir le libellé privé', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await prisma.groupMember.create({ data: { groupId, userId: await userId(bob) } })

  await busy(bob, day(2), day(3), 'Rendez-vous médical')

  const raw = await (await calendar(alice, groupId, window30)).text()

  expect(raw).not.toContain('Rendez-vous médical')
  expect(raw).not.toContain('label')
})

it('nomme le membre occupé sans dévoiler son adresse', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)
  await busy(alice, day(2), day(3))

  const raw = await (await calendar(alice, groupId, window30)).text()

  expect(raw).not.toContain('alice@example.test')
})

it('écarte les créneaux plus courts que la durée minimale demandée', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)
  await busy(alice, day(1), day(10))
  await busy(alice, day(10, 1), day(30))

  const query = `?from=${day(1)}&to=${day(30)}&minimumMinutes=120`
  const body = (await (await calendar(alice, groupId, query)).json()) as Calendar

  expect(body.free).toEqual([])
})

// Une fenêtre absente est une requête incomplète, pas une panne : `schema.parse()` appelé
// directement dans la route aurait rendu 500 par le gestionnaire global.
it('refuse une fenêtre absente', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await calendar(alice, groupId, '')

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'validation_error' })
})

it('refuse une fenêtre inversée', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const response = await calendar(alice, groupId, `?from=${day(30)}&to=${day(1)}`)

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'invalid_period' })
})

// Sans borne, un appel sur dix ans lirait toute la table.
it('refuse une fenêtre de plus de 90 jours', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)

  const from = new Date(Date.UTC(2026, 0, 1)).toISOString()
  const to = new Date(Date.UTC(2026, 11, 31)).toISOString()
  const response = await calendar(alice, groupId, `?from=${from}&to=${to}`)

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'window_too_wide' })
})

it('refuse la lecture à un non-membre', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)

  const response = await calendar(bob, groupId, window30)

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'not_a_member' })
})

// Une absence commencée avant la fenêtre ne doit pas repousser le premier créneau libre
// hors du domaine demandé.
it('borne à la fenêtre une occupation qui la déborde', async () => {
  const alice = await signIn('alice@example.test')
  const groupId = await makeGroup(alice)
  await busy(alice, day(1), day(5))

  const query = `?from=${day(3)}&to=${day(10)}`
  const body = (await (await calendar(alice, groupId, query)).json()) as Calendar

  expect(body.free).toHaveLength(1)
  expect(body.free[0]).toMatchObject({ startsAt: day(5), endsAt: day(10) })
})

it("n'enlève rien pour un membre sans indisponibilité", async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const groupId = await makeGroup(alice)
  await prisma.groupMember.create({ data: { groupId, userId: await userId(bob) } })

  await busy(alice, day(2), day(3))

  const body = (await (await calendar(alice, groupId, window30)).json()) as Calendar

  expect(body.busy).toHaveLength(1)
  expect(body.free).toHaveLength(2)
})
