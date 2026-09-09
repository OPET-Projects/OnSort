import { ref } from 'vue'
import { ApiFetchError, apiFetch } from '../lib/http'
import { useSessionStore } from '../stores/session'

export type InvitePreview = {
  eventId: string
  title: string
  startsAt: string
  endsAt: string
  organiser: string
  participantCount: number
  alreadyMember: boolean
}

type Navigation = {
  toLogin: () => void
  toEvent: (eventId: string) => void
  toHome: () => void
}

// Ouvre un jeton d'invitation (conception §3.2). Ouvrir un lien **ne fait plus rejoindre** :
// l'invité voit d'abord de quoi il s'agit, puis tranche. Ce sont deux gestes distincts, et
// c'est volontaire — rejoindre un événement était jusqu'ici la conséquence silencieuse d'un
// clic sur un lien reçu, sans que personne n'ait rien confirmé.
export function useInvite(token: string, nav: Navigation) {
  const state = ref<'loading' | 'ready' | 'joining' | 'error'>('loading')
  const preview = ref<InvitePreview | null>(null)
  const message = ref('')

  function explain(cause: unknown): void {
    state.value = 'error'

    if (cause instanceof ApiFetchError && cause.code === 'invitation_not_found') {
      message.value = "Cette invitation n'est plus valide."
    } else if (cause instanceof ApiFetchError && cause.code === 'invitation_not_yours') {
      message.value = 'Cette invitation est adressée à une autre personne.'
    } else if (cause instanceof ApiFetchError && cause.code.startsWith('invitation_link_')) {
      message.value = "Ce lien d'invitation n'est plus actif."
    } else {
      message.value =
        cause instanceof Error ? cause.message : "L'invitation n'a pas pu être ouverte."
    }
  }

  async function load(): Promise<void> {
    const session = useSessionStore()

    if (session.status === 'unknown') {
      await session.fetchSession()
    }

    // Le compte est obligatoire (conception §4) : la reprise garde le chemin de
    // l'invitation, pour que le jeton survive à l'aller-retour du courriel.
    if (session.status !== 'authenticated') {
      nav.toLogin()
      return
    }

    try {
      const body = await apiFetch<InvitePreview>(`/api/invitations/${token}`)

      // Déjà entré : reposer la question n'aurait pas de sens, et une popup sur un
      // événement qu'on relit chaque jour deviendrait vite une porte à pousser.
      if (body.alreadyMember) {
        nav.toEvent(body.eventId)
        return
      }

      preview.value = body
      state.value = 'ready'
    } catch (cause) {
      explain(cause)
    }
  }

  async function accept(): Promise<void> {
    state.value = 'joining'

    try {
      const { eventId } = await apiFetch<{ eventId: string }>(`/api/invitations/${token}/accept`, {
        method: 'POST',
      })
      nav.toEvent(eventId)
    } catch (cause) {
      explain(cause)
    }
  }

  // Refuser n'écrit rien. Le lien reste utilisable : l'invité qui change d'avis le rouvre,
  // et aucun état de cette application n'a le droit d'être un cul-de-sac.
  function decline(): void {
    nav.toHome()
  }

  return { state, preview, message, load, accept, decline }
}
