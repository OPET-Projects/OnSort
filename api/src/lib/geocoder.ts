import { type Place, parseBanResponse } from './places.ts'

// Recherche de lieu, adossée à l'API Base Adresse Nationale (decisions-techniques §2.7).
// Gratuite, sans clé, sans quota, et de très bonne qualité sur les adresses françaises.
//
// **C'est le seul endroit du projet qui connaît la BAN.** L'interface `PlaceSearch` existe
// pour permettre un basculement vers Photon ou un service tiers sans toucher au reste du
// code — Photon a été écarté parce que son auto-hébergement demande 8 à 16 Go de RAM et
// risquerait de faire tuer PostgreSQL par le gestionnaire de mémoire.

export type PlaceSearch = {
  search(query: string, limit?: number): Promise<Place[]>
}

const ENDPOINT = 'https://api-adresse.data.gouv.fr/search/'

// En dessous, la BAN ne rend rien d'utile — et l'autocomplétion interroge à chaque touche.
const MINIMUM_QUERY_LENGTH = 3

// Une BAN lente ne doit pas retarder l'enregistrement d'une activité : au-delà, on renonce.
const TIMEOUT_MS = 3000

const DEFAULT_LIMIT = 5

// Les services publics demandent qu'un appelant s'identifie, et c'est ce qui permet de nous
// joindre plutôt que de nous bloquer si notre usage devenait gênant.
const USER_AGENT = 'On Sort ? (projet étudiant Efrei)'

export const geocoder: PlaceSearch = {
  async search(query: string, limit = DEFAULT_LIMIT): Promise<Place[]> {
    const trimmed = query.trim()

    if (trimmed.length < MINIMUM_QUERY_LENGTH) {
      return []
    }

    const url = new URL(ENDPOINT)
    url.searchParams.set('q', trimmed)
    url.searchParams.set('limit', String(limit))

    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      // Un service tiers indisponible n'est pas une erreur de l'appelant : une adresse non
      // géocodée reste une adresse valide, elle n'apparaît simplement pas sur la carte.
      if (!response.ok) {
        return []
      }

      return parseBanResponse(await response.json())
    } catch (error) {
      // Journalisé en avertissement et non en erreur : c'est une dégradation attendue, pas
      // une panne de l'application.
      console.warn(`Géocodage de « ${trimmed} » indisponible :`, error)
      return []
    }
  },
}
