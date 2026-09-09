import { expect, it } from 'vitest'
import { bestMatch, parseBanResponse } from '../../src/lib/places.ts'

// Réponse réaliste de l'API Base Adresse Nationale, au format GeoJSON.
const banResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
      properties: { label: '1 Rue de Rivoli 75001 Paris', score: 0.96 },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [4.8357, 45.764] },
      properties: { label: '1 Rue de Rivoli 69001 Lyon', score: 0.62 },
    },
  ],
}

// GeoJSON ordonne [longitude, latitude], Leaflet attend l'inverse. Les confondre place les
// adresses françaises quelque part en Somalie, et rien ne le signale.
it('lit les coordonnées dans le bon ordre', () => {
  const [first] = parseBanResponse(banResponse)

  expect(first?.lat).toBeCloseTo(48.8566)
  expect(first?.lng).toBeCloseTo(2.3522)
})

it('rend le libellé et le score', () => {
  const [first] = parseBanResponse(banResponse)

  expect(first?.label).toBe('1 Rue de Rivoli 75001 Paris')
  expect(first?.score).toBeCloseTo(0.96)
})

it('rend toutes les entités', () => {
  expect(parseBanResponse(banResponse)).toHaveLength(2)
})

// Un service tiers peut changer de forme, tomber en panne, ou répondre autre chose que ce
// qu'on attend. Aucun de ces cas ne doit lever.
it.each([
  ['un corps nul', null],
  ['un corps vide', {}],
  ['une chaîne', 'indisponible'],
  ['une collection sans entité', { type: 'FeatureCollection', features: [] }],
  ['des entités qui ne sont pas un tableau', { features: 'non' }],
])('rend une liste vide sur %s', (_label, body) => {
  expect(parseBanResponse(body)).toEqual([])
})

it('ignore une entité sans coordonnées plutôt que de produire un NaN', () => {
  const places = parseBanResponse({
    features: [
      { geometry: null, properties: { label: 'Sans point', score: 0.9 } },
      { geometry: { coordinates: [2.35, 48.85] }, properties: { label: 'Bon', score: 0.9 } },
    ],
  })

  expect(places).toHaveLength(1)
  expect(places[0]?.label).toBe('Bon')
})

it('ignore une entité dont les coordonnées ne sont pas des nombres', () => {
  const places = parseBanResponse({
    features: [{ geometry: { coordinates: ['2.35', null] }, properties: { label: 'x', score: 1 } }],
  })

  expect(places).toEqual([])
})

it('supplée un score absent par zéro', () => {
  const [place] = parseBanResponse({
    features: [{ geometry: { coordinates: [2.35, 48.85] }, properties: { label: 'x' } }],
  })

  expect(place?.score).toBe(0)
})

// La BAN rend toujours un résultat, même très mauvais. Un pin au mauvais endroit est pire
// qu'un pin absent, parce qu'il se croit vrai.
it('retient le meilleur score, pas le premier', () => {
  const places = [
    { label: 'a', lat: 1, lng: 1, score: 0.4 },
    { label: 'b', lat: 2, lng: 2, score: 0.9 },
  ]

  expect(bestMatch(places)?.label).toBe('b')
})

it('rend null quand le meilleur score reste sous le seuil', () => {
  expect(bestMatch([{ label: 'a', lat: 1, lng: 1, score: 0.2 }])).toBeNull()
})

it('rend null sur une liste vide', () => {
  expect(bestMatch([])).toBeNull()
})

it('accepte un score exactement au seuil', () => {
  expect(bestMatch([{ label: 'a', lat: 1, lng: 1, score: 0.5 }], 0.5)?.label).toBe('a')
})
