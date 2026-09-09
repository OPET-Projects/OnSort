import { ref } from 'vue'
import { ApiFetchError, apiFetch } from '../lib/http'
import { useSessionStore } from '../stores/session'

// Les trois réponses possibles à une invitation (conception §2.5). « Je ne sais pas
// encore » en est une : elle dit à l'organisateur que la question a été vue.
export type Rsvp = 'accepted' | 'invited' | 'declined'

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

  // Les trois réponses passent par le même chemin : répondre fait entrer dans l'événement,
  // y compris sur un refus. La ligne conserve la trace de la réponse, et son auteur peut
  // revenir dessus depuis l'onglet Participants (§3.2). Sans cela, décliner serait
  // indistinguable de n'avoir jamais ouvert le lien.
  async function respond(rsvp: Rsvp): Promise<void> {
    state.value = 'joining'

    try {
      const { eventId } = await apiFetch<{ eventId: string }>(`/api/invitations/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify({ rsvp }),
      })

      // Refuser puis atterrir sur l'événement serait contradictoire : on renvoie à
      // l'accueil. La participation existe malgré tout, si bien que l'événement reste
      // atteignable depuis le tableau de bord pour qui change d'avis.
      if (rsvp === 'declined') {
        nav.toHome()
        return
      }

      nav.toEvent(eventId)
    } catch (cause) {
      explain(cause)
    }
  }

  return { state, preview, message, load, respond }
}
