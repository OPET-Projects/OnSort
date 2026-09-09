import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type MapConfig = {
  tilesUrl: string
  attribution: string
}

// Configuration de la carte, servie par l'API et non figée dans le front (voir
// `decisions-techniques` §2.6). Changer de fournisseur de tuiles ne demande donc ni
// reconstruction ni redéploiement du front.
export function useMapConfig() {
  const config = ref<MapConfig | null>(null)
  const error = ref('')

  async function load(): Promise<void> {
    try {
      config.value = await apiFetch<MapConfig>('/api/map/config')
    } catch (cause) {
      // Une carte sans tuiles n'est pas une panne de l'application : le reste de l'écran
      // continue de fonctionner, et l'onglet le dit.
      error.value = cause instanceof Error ? cause.message : 'Carte indisponible.'
    }
  }

  onMounted(load)

  return { config, error, load }
}
