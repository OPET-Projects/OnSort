import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type EventSummary = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  status: 'draft' | 'active' | 'closed'
  role: 'admin' | 'member'
  rsvp: 'invited' | 'accepted' | 'declined'
}

// Liste des événements de l'appelant pour le tableau de bord. Les quatre états d'interface
// de la conception §6.6 sont explicites.
export function useEvents() {
  const state = ref<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const events = ref<EventSummary[]>([])
  const error = ref('')

  async function load(): Promise<void> {
    state.value = 'loading'
    try {
      const body = await apiFetch<{ events: EventSummary[] }>('/api/events')
      events.value = body.events
      state.value = body.events.length === 0 ? 'empty' : 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      state.value = 'error'
    }
  }

  onMounted(load)

  return { state, events, error, reload: load }
}
