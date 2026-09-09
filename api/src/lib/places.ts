// Lecture d'une réponse de l'API Base Adresse Nationale (decisions-techniques §2.7).
// Fonctions pures, sans entrées-sorties : l'appel réseau vit dans `lib/geocoder.ts`, et
// c'est ici que porte l'effort de test.

export type Place = {
  label: string
  lat: number
  lng: number
  score: number
}

// En dessous de ce score, la BAN a répondu quelque chose plutôt que rien. Un pin au mauvais
// endroit est pire qu'un pin absent, parce qu'il se croit vrai.
const DEFAULT_MINIMUM_SCORE = 0.5

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// **GeoJSON ordonne `[longitude, latitude]`**, Leaflet et le reste du code attendent
// l'inverse. Les confondre place les adresses françaises quelque part en Somalie, sans
// qu'aucune erreur n'apparaisse — c'est le piège du format, et il est désamorcé ici, une
// fois pour toutes.
function readFeature(feature: unknown): Place | null {
  if (typeof feature !== 'object' || feature === null) {
    return null
  }

  const { geometry, properties } = feature as { geometry?: unknown; properties?: unknown }

  if (typeof geometry !== 'object' || geometry === null) {
    return null
  }

  const coordinates = (geometry as { coordinates?: unknown }).coordinates

  if (!Array.isArray(coordinates)) {
    return null
  }

  const [lng, lat] = coordinates

  if (!isNumber(lat) || !isNumber(lng)) {
    return null
  }

  const props = (typeof properties === 'object' && properties !== null ? properties : {}) as {
    label?: unknown
    score?: unknown
  }

  return {
    label: typeof props.label === 'string' ? props.label : '',
    lat,
    lng,
    // Un score absent vaut zéro : sans lui, une entité mal formée passerait le seuil par
    // défaut au lieu d'être écartée.
    score: isNumber(props.score) ? props.score : 0,
  }
}

// Un service tiers peut changer de forme ou tomber en panne. Aucune de ces situations ne
// doit lever : une adresse non géocodée reste une adresse valide.
export function parseBanResponse(body: unknown): Place[] {
  if (typeof body !== 'object' || body === null) {
    return []
  }

  const features = (body as { features?: unknown }).features

  if (!Array.isArray(features)) {
    return []
  }

  return features.map(readFeature).filter((place): place is Place => place !== null)
}

export function bestMatch(
  places: readonly Place[],
  minimumScore = DEFAULT_MINIMUM_SCORE,
): Place | null {
  const best = [...places].sort((left, right) => right.score - left.score)[0]

  if (best === undefined || best.score < minimumScore) {
    return null
  }

  return best
}
