import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'
import { seedEventWithParticipants } from './helpers/fixtures.ts'

async function makeActivity(data: { lat?: number | null; lng?: number | null }) {
  const { eventId, participants } = await seedEventWithParticipants(1)

  return prisma.activity.create({
    data: { eventId, title: 'Musée', proposedBy: participants[0].id, ...data },
  })
}

it('accepte une activité sans coordonnées', async () => {
  const activity = await makeActivity({})

  expect(activity.lat).toBeNull()
  expect(activity.lng).toBeNull()
})

it('enregistre une paire de coordonnées', async () => {
  const activity = await makeActivity({ lat: 48.8566, lng: 2.3522 })

  expect(activity.lat).toBeCloseTo(48.8566)
  expect(activity.lng).toBeCloseTo(2.3522)
})

// Une coordonnée à moitié posée ne place rien, et laisserait le front décider quoi en faire.
it.each([
  ['latitude seule', { lat: 48.8566, lng: null }],
  ['longitude seule', { lat: null, lng: 2.3522 }],
])('refuse une %s', async (_label, data) => {
  await expect(makeActivity(data)).rejects.toThrow()
})

it.each([
  ['latitude trop grande', { lat: 91, lng: 2 }],
  ['latitude trop petite', { lat: -91, lng: 2 }],
  ['longitude trop grande', { lat: 48, lng: 181 }],
  ['longitude trop petite', { lat: 48, lng: -181 }],
])('refuse une %s', async (_label, data) => {
  await expect(makeActivity(data)).rejects.toThrow()
})

// Les bornes elles-mêmes sont valides : le pôle Sud et l'antiméridien existent.
it('accepte les bornes du domaine', async () => {
  const activity = await makeActivity({ lat: -90, lng: 180 })

  expect(activity.lat).toBe(-90)
})
