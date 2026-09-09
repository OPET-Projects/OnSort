import { expect, it } from 'vitest'
import { freeSlots, mergeIntervals } from '../../src/lib/calendar.ts'

const at = (day: number, hour = 0) => new Date(Date.UTC(2026, 9, day, hour))

const span = (from: [number, number?], to: [number, number?]) => ({
  startsAt: at(from[0], from[1]),
  endsAt: at(to[0], to[1]),
})

it('laisse intactes des plages disjointes, et les trie', () => {
  expect(mergeIntervals([span([3], [4]), span([1], [2])])).toEqual([span([1], [2]), span([3], [4])])
})

it('fusionne deux plages qui se recouvrent', () => {
  expect(mergeIntervals([span([1], [3]), span([2], [4])])).toEqual([span([1], [4])])
})

// Bornes semi-ouvertes : deux plages adjacentes ne se **chevauchent** pas, mais les fusionner
// est la bonne ergonomie — « occupé du 1 au 2 » puis « du 2 au 3 » est une seule absence.
it('fusionne deux plages adjacentes', () => {
  expect(mergeIntervals([span([1], [2]), span([2], [3])])).toEqual([span([1], [3])])
})

it('absorbe une plage entièrement contenue dans une autre', () => {
  expect(mergeIntervals([span([1], [5]), span([2], [3])])).toEqual([span([1], [5])])
})

it('enchaîne une fusion en cascade', () => {
  expect(mergeIntervals([span([1], [2]), span([3], [4]), span([2], [3])])).toEqual([span([1], [4])])
})

it('rend une liste vide sur une entrée vide', () => {
  expect(mergeIntervals([])).toEqual([])
})

// La fonction est pure : elle ne doit pas écrire dans les objets qu'on lui confie. Sans
// cette garantie, fusionner les lignes lues en base modifierait les lignes elles-mêmes.
it('ne modifie pas les intervalles reçus', () => {
  const first = span([1], [3])
  const second = span([2], [4])

  mergeIntervals([first, second])

  expect(first.endsAt).toEqual(at(3))
})

it('rend la fenêtre entière quand personne n’est occupé', () => {
  expect(freeSlots(span([1], [5]), [])).toEqual([span([1], [5])])
})

it('retranche une occupation centrale', () => {
  expect(freeSlots(span([1], [5]), [span([2], [3])])).toEqual([span([1], [2]), span([3], [5])])
})

it('rend une liste vide quand la fenêtre est entièrement occupée', () => {
  expect(freeSlots(span([1], [5]), [span([1], [5])])).toEqual([])
})

// Une occupation qui déborde la fenêtre ne doit pas la déborder en retour : sans découpe,
// le premier créneau libre commencerait avant le début demandé.
it('borne les occupations à la fenêtre', () => {
  expect(freeSlots(span([2], [4]), [span([1], [3])])).toEqual([span([3], [4])])
})

it('ignore une occupation entièrement hors de la fenêtre', () => {
  expect(freeSlots(span([5], [8]), [span([1], [2])])).toEqual([span([5], [8])])
})

it('fusionne les occupations avant de retrancher', () => {
  expect(freeSlots(span([1], [6]), [span([2], [4]), span([3], [5])])).toEqual([
    span([1], [2]),
    span([5], [6]),
  ])
})

// C'est la superposition de plusieurs membres : deux absences distinctes ne laissent qu'un
// créneau au milieu.
it('laisse le créneau qui convient à tous', () => {
  expect(freeSlots(span([1], [10]), [span([1], [4]), span([6], [10])])).toEqual([span([4], [6])])
})

// Un trou de quelques minutes entre deux réunions n'est pas un créneau de sortie, et
// l'afficher noierait les vrais.
it('écarte les créneaux plus courts que la durée minimale', () => {
  expect(freeSlots(span([1, 0], [1, 1]), [], 120)).toEqual([])
})

it('garde un créneau exactement à la durée minimale', () => {
  expect(freeSlots(span([1, 0], [1, 2]), [], 120)).toEqual([span([1, 0], [1, 2])])
})
