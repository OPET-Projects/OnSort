import { ref } from 'vue'
import { apiFetch } from '../lib/http'

export type Place = {
  label: string
  lat: number
  lng: number
  score: number
}

// En dessous, l'API ne consulte pas la BAN : c'est la même borne, répétée ici pour ne pas
// émettre de requête dont on connaît déjà la réponse.
const MINIMUM_QUERY_LENGTH = 3

// L'autocomplétion se déclenche à la frappe. Sans ce délai, taper une adresse de trente
// caractères produirait trente requêtes vers un service public gratuit.
const DEBOUNCE_MS = 300

export function usePlaces() {
  const suggestions = ref<Place[]>([])
  const searching = ref(false)

  let timer: ReturnType<typeof setTimeout> | undefined
  // Chaque recherche porte un numéro : une réponse lente arrivant après une plus récente
  // ne doit pas écraser des propositions déjà à jour.
  let latest = 0

  function clear(): void {
    clearTimeout(timer)
    suggestions.value = []
    searching.value = false
  }

  function search(query: string): void {
    clearTimeout(timer)

    if (query.trim().length < MINIMUM_QUERY_LENGTH) {
      suggestions.value = []
      return
    }

    searching.value = true
    latest += 1
    const ticket = latest

    timer = setTimeout(async () => {
      try {
        const body = await apiFetch<{ places: Place[] }>(
          `/api/places?q=${encodeURIComponent(query)}`,
        )

        if (ticket === latest) {
          suggestions.value = body.places
        }
      } catch {
        // Une suggestion absente n'empêche pas de saisir une adresse à la main : l'échec est
        // silencieux, parce qu'il n'y a rien que l'utilisateur puisse faire.
        if (ticket === latest) {
          suggestions.value = []
        }
      } finally {
        if (ticket === latest) {
          searching.value = false
        }
      }
    }, DEBOUNCE_MS)
  }

  return { suggestions, searching, search, clear }
}
