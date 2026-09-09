import { afterEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { geocoder } from '../../src/lib/geocoder.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

async function send(method: string, path: string, headers: Headers, body?: unknown) {
  return app.request(path, {
    method,
    headers: new Headers([...headers, ['content-type', 'application/json']]),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function makeEvent(headers: Headers): Promise<string> {
  const response = await send('POST', '/api/events', headers, {
    title: 'Week-end',
    startsAt: '2026-10-01T18:00:00.000Z',
    endsAt: '2026-10-03T22:00:00.000Z',
  })
  return ((await response.json()) as { id: string }).id
}

const rivoli = [{ label: '1 Rue de Rivoli 75001 Paris', lat: 48.8566, lng: 2.3522, score: 0.96 }]

// `mockClear` est indispensable : `vi.spyOn` sur une méthode déjà espionnée rend le **même**
// espion, avec son historique. Sans remise à zéro, un appel fait avant le second appel à
// cette aide compterait dans les assertions qui suivent.
const stubGeocoder = (places: typeof rivoli) =>
  vi.spyOn(geocoder, 'search').mockClear().mockResolvedValue(places)

async function propose(headers: Headers, eventId: string, body: Record<string, unknown>) {
  const response = await send('POST', `/api/events/${eventId}/activities`, headers, {
    title: 'Musée',
    ...body,
  })
  return ((await response.json()) as { id: string }).id
}

const activityOf = (id: string) => prisma.activity.findUniqueOrThrow({ where: { id } })

it("géocode l'adresse à la création", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const search = stubGeocoder(rivoli)

  const id = await propose(alice, eventId, { address: '1 rue de Rivoli, Paris' })
  const activity = await activityOf(id)

  expect(search).toHaveBeenCalledWith('1 rue de Rivoli, Paris')
  expect(activity.lat).toBeCloseTo(48.8566)
  expect(activity.lng).toBeCloseTo(2.3522)
})

it("n'appelle pas le service sans adresse", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const search = stubGeocoder(rivoli)

  const id = await propose(alice, eventId, {})

  expect(search).not.toHaveBeenCalled()
  expect((await activityOf(id)).lat).toBeNull()
})

// La BAN rend toujours quelque chose : sous le seuil, mieux vaut aucun pin qu'un faux.
it("n'enregistre rien quand le meilleur résultat est trop faible", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  stubGeocoder([{ label: 'Quelque part', lat: 1, lng: 1, score: 0.2 }])

  const id = await propose(alice, eventId, { address: 'zzzz' })

  expect((await activityOf(id)).lat).toBeNull()
})

// Perdre une saisie parce qu'un service tiers est tombé serait le pire des échanges.
it("crée l'activité même quand le géocodage échoue", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  vi.spyOn(geocoder, 'search').mockRejectedValue(new Error('service indisponible'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  const response = await send('POST', `/api/events/${eventId}/activities`, alice, {
    title: 'Musée',
    address: '1 rue de Rivoli',
  })

  expect(response.status).toBe(201)

  const { id } = (await response.json()) as { id: string }
  expect((await activityOf(id)).lat).toBeNull()
})

it("regéocode quand l'adresse change", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  stubGeocoder(rivoli)
  const id = await propose(alice, eventId, { address: '1 rue de Rivoli' })

  const search = vi
    .spyOn(geocoder, 'search')
    .mockResolvedValue([{ label: 'Lyon', lat: 45.764, lng: 4.8357, score: 0.9 }])

  await send('PATCH', `/api/activities/${id}`, alice, { address: 'place Bellecour, Lyon' })

  expect(search).toHaveBeenCalledWith('place Bellecour, Lyon')
  expect((await activityOf(id)).lat).toBeCloseTo(45.764)
})

// Un appel réseau par frappe sur le titre serait gratuit pour le service et lent pour nous.
it('ne regéocode pas quand seul le titre change', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  stubGeocoder(rivoli)
  const id = await propose(alice, eventId, { address: '1 rue de Rivoli' })

  const search = stubGeocoder(rivoli)
  await send('PATCH', `/api/activities/${id}`, alice, { title: 'Musée du Louvre' })

  expect(search).not.toHaveBeenCalled()
  expect((await activityOf(id)).lat).toBeCloseTo(48.8566)
})

// Sans cet effacement, un pin resterait au dernier lieu connu d'une activité qui n'en a plus.
it("efface les coordonnées quand l'adresse est effacée", async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  stubGeocoder(rivoli)
  const id = await propose(alice, eventId, { address: '1 rue de Rivoli' })

  const search = stubGeocoder(rivoli)
  await send('PATCH', `/api/activities/${id}`, alice, { address: '' })

  expect(search).not.toHaveBeenCalled()

  const activity = await activityOf(id)
  expect(activity.lat).toBeNull()
  expect(activity.lng).toBeNull()
})

it('rend les coordonnées dans le programme', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  stubGeocoder(rivoli)
  await propose(alice, eventId, { address: '1 rue de Rivoli' })

  const response = await app.request(`/api/events/${eventId}/activities`, { headers: alice })
  const { activities } = (await response.json()) as {
    activities: { lat: number | null; lng: number | null }[]
  }

  expect(activities[0]?.lat).toBeCloseTo(48.8566)
  expect(activities[0]?.lng).toBeCloseTo(2.3522)
})
