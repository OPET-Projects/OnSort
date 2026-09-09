import { expect, it } from 'vitest'
import { formatDuration, formatSlot } from '../src/lib/slots.ts'

// Les instants sont construits en heure **locale** : écrits en UTC, ils franchiraient minuit
// dans certains fuseaux et le test dépendrait de la machine qui l'exécute.
const local = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()

it('affiche une plage tenant dans une journée avec ses deux heures', () => {
  const text = formatSlot(local(1, 14), local(1, 18))

  expect(text).toContain('de')
  expect(text).toContain('à')
})

it('affiche une plage sur plusieurs jours avec ses deux dates', () => {
  const text = formatSlot(local(1, 14), local(5, 18))

  expect(text.startsWith('du ')).toBe(true)
  expect(text).toContain(' au ')
})

it.each([
  ['2026-10-01T00:00:00.000Z', '2026-10-04T00:00:00.000Z', '3 j'],
  ['2026-10-01T00:00:00.000Z', '2026-10-01T05:00:00.000Z', '5 h'],
  ['2026-10-01T00:00:00.000Z', '2026-10-01T00:45:00.000Z', '45 min'],
  ['2026-10-01T00:00:00.000Z', '2026-10-02T03:00:00.000Z', '1 j 3 h'],
])('rend la durée %s → %s comme « %s »', (from, to, expected) => {
  expect(formatDuration(from, to)).toBe(expected)
})
