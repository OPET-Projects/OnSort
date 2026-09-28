import { expect, it } from 'vitest'
import { isoToLocalInput, localInputToIso } from '../src/lib/dates.ts'
import { newEventLink, readEventDraft } from '../src/lib/event-draft.ts'

// Construit en heure locale : en UTC, l'instant franchirait minuit dans certains fuseaux.
const local = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()

it('rend un instant au format datetime-local, en heure locale', () => {
  expect(isoToLocalInput(local(3, 9))).toBe('2026-10-03T09:00')
})

it('fait l’aller-retour avec localInputToIso', () => {
  const iso = local(12, 18)
  expect(localInputToIso(isoToLocalInput(iso))).toBe(iso)
})

it('construit le lien d’un groupe sans créneau', () => {
  expect(newEventLink('g-1')).toEqual({ path: '/events/new', query: { group: 'g-1' } })
})

it('construit le lien d’un créneau', () => {
  const slot = { startsAt: local(3, 9), endsAt: local(3, 18) }

  expect(newEventLink('g-1', slot)).toEqual({
    path: '/events/new',
    query: { group: 'g-1', startsAt: slot.startsAt, endsAt: slot.endsAt },
  })
})

it('relit un lien de créneau en valeurs de formulaire', () => {
  const query = newEventLink('g-1', { startsAt: local(3, 9), endsAt: local(3, 18) }).query

  expect(readEventDraft(query)).toEqual({
    groupId: 'g-1',
    startsAt: '2026-10-03T09:00',
    endsAt: '2026-10-03T18:00',
  })
})

it('rend un brouillon vide sans paramètres', () => {
  expect(readEventDraft({})).toEqual({ groupId: null, startsAt: '', endsAt: '' })
})

// Un lien tapé ou tronqué ne doit pas afficher « Invalid Date » dans le champ.
it('ignore une date illisible', () => {
  expect(readEventDraft({ startsAt: 'demain', endsAt: ['a', 'b'] })).toEqual({
    groupId: null,
    startsAt: '',
    endsAt: '',
  })
})
