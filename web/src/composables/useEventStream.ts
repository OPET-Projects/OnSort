import { onMounted, onUnmounted } from 'vue'
import type { Tally } from './useActivities'

// Messages diffusés par l'API pour un événement ouvert à l'écran (conception §5.2). Tous
// ne transportent que `{ type, id }` et déclenchent un rechargement **ciblé** — sauf
// `activity.vote`, dont le décompte est appliqué directement.
//
// Le ciblage compte : recharger le programme quand une réponse change, ou l'inverse,
// coûterait une requête pour rien et laisserait l'écran périmé sur la moitié qui a bougé.
const ACTIVITY_TYPES = ['activity.created', 'activity.updated', 'activity.decided'] as const
const PARTICIPANT_TYPES = ['participant.rsvp'] as const
// Les quatre messages financiers déclenchent le même rechargement : dépenses et soldes
// voyagent ensemble, et un virement confirmé bouge les deux.
const EXPENSE_TYPES = [
  'expense.created',
  'expense.updated',
  'settlement.declared',
  'settlement.confirmed',
] as const

type Handlers = {
  onTally: (activityId: string, tally: Tally) => void
  onActivityChange: () => void
  onParticipantChange: () => void
  onExpenseChange: () => void
}

type VoteMessage = { activityId: string; for: number; against: number }

// Flux temps réel d'un événement. `EventSource` ne permet pas d'envoyer d'en-têtes :
// l'authentification passe par le cookie de session, ce qui impose de servir le front et
// l'API sur la même origine.
export function useEventStream(eventId: string, handlers: Handlers) {
  let source: EventSource | null = null

  onMounted(() => {
    source = new EventSource(`/api/events/${eventId}/stream`)

    source.addEventListener('activity.vote', (message) => {
      const payload = JSON.parse((message as MessageEvent).data) as VoteMessage
      handlers.onTally(payload.activityId, { for: payload.for, against: payload.against })
    })

    for (const type of ACTIVITY_TYPES) {
      source.addEventListener(type, () => handlers.onActivityChange())
    }

    for (const type of PARTICIPANT_TYPES) {
      source.addEventListener(type, () => handlers.onParticipantChange())
    }

    for (const type of EXPENSE_TYPES) {
      source.addEventListener(type, () => handlers.onExpenseChange())
    }
  })

  onUnmounted(() => {
    // Sans cette fermeture, naviguer d'un événement à l'autre laisserait une connexion
    // ouverte par événement visité — et un abonné mort dans le bus côté serveur.
    source?.close()
    source = null
  })
}
