import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type Unavailability = {
  id: string
  startsAt: string
  endsAt: string
  label: string | null
}

// Calendrier personnel. Le libellé reste **privé** : il n'apparaît que sur cet écran, jamais
// dans un calendrier de groupe (conception §2.4).
//
// Les plages qui se touchent sont fusionnées côté API : deux saisies peuvent donc ne rendre
// qu'une ligne, et l'interface le dit — sans un mot, ça passerait pour un bogue.
export function useCalendar() {
  const state = ref<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const unavailability = ref<Unavailability[]>([])
  const error = ref('')

  async function reload(): Promise<void> {
    try {
      const body = await apiFetch<{ unavailability: Unavailability[] }>('/api/me/unavailability')
      unavailability.value = body.unavailability
      state.value = body.unavailability.length === 0 ? 'empty' : 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      state.value = 'error'
    }
  }

  async function add(input: { startsAt: string; endsAt: string; label?: string }): Promise<void> {
    await apiFetch('/api/me/unavailability', { method: 'POST', body: JSON.stringify(input) })
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await apiFetch(`/api/me/unavailability/${id}`, { method: 'DELETE' })
    await reload()
  }

  onMounted(reload)

  return { state, unavailability, error, reload, add, remove }
}
