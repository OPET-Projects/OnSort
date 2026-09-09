import { onMounted, ref } from 'vue'
import { ApiFetchError, apiFetch } from '../lib/http'
import { useSessionStore } from '../stores/session'

type Navigation = {
  toLogin: () => void
  toEvent: (eventId: string) => void
}

// Consomme un jeton d'invitation (conception §3.2). Si la session n'est pas ouverte,
// renvoie vers la connexion en gardant le chemin de reprise ; sinon accepte l'invitation
// et redirige vers l'événement.
export function useInvite(token: string, nav: Navigation) {
  const state = ref<'working' | 'error'>('working')
  const message = ref('')

  async function run(): Promise<void> {
    const session = useSessionStore()

    if (session.status === 'unknown') {
      await session.fetchSession()
    }

    if (session.status !== 'authenticated') {
      nav.toLogin()
      return
    }

    try {
      const { eventId } = await apiFetch<{ eventId: string }>(`/api/invitations/${token}/accept`, {
        method: 'POST',
      })
      nav.toEvent(eventId)
    } catch (cause) {
      state.value = 'error'
      if (cause instanceof ApiFetchError && cause.code === 'invitation_not_found') {
        message.value = "Cette invitation n'est plus valide."
      } else if (cause instanceof ApiFetchError && cause.code === 'invitation_not_yours') {
        message.value = 'Cette invitation est adressée à une autre personne.'
      } else if (cause instanceof ApiFetchError && cause.code.startsWith('invitation_link_')) {
        message.value = "Ce lien d'invitation n'est plus actif."
      } else {
        message.value =
          cause instanceof Error ? cause.message : "L'invitation n'a pas pu être acceptée."
      }
    }
  }

  onMounted(run)

  return { state, message, run }
}
