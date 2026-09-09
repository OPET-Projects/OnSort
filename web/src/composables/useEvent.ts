import { onMounted, ref } from 'vue'
import { ApiFetchError, apiFetch } from '../lib/http'

export type Participant = {
  userId: string
  name: string
  email: string
  role: 'admin' | 'member'
  rsvp: 'invited' | 'accepted' | 'declined'
  joinedAt: string
}

export type EventDetail = {
  id: string
  title: string
  description: string
  startsAt: string
  endsAt: string
  status: 'draft' | 'active' | 'closed'
  createdBy: string
  participants: Participant[]
  viewer: {
    participantId: string
    role: 'admin' | 'member'
    rsvp: 'invited' | 'accepted' | 'declined'
  }
}

export type EventPatch = Partial<
  Pick<EventDetail, 'title' | 'description' | 'startsAt' | 'endsAt' | 'status'>
>

// État d'un événement, monté et détruit avec la vue (conception §6.2 : pas de magasin
// global, qui produirait de l'état périmé lors d'une navigation entre événements).
export function useEvent(id: string) {
  const state = ref<'loading' | 'error' | 'ready'>('loading')
  const event = ref<EventDetail | null>(null)
  const error = ref('')

  async function refresh(): Promise<void> {
    try {
      const body = await apiFetch<{ event: EventDetail }>(`/api/events/${id}`)
      event.value = body.event
      state.value = 'ready'
    } catch (cause) {
      if (cause instanceof ApiFetchError && cause.code === 'not_a_participant') {
        error.value = 'Vous ne participez pas à cet événement.'
      } else {
        error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      }
      state.value = 'error'
    }
  }

  async function setRsvp(rsvp: 'accepted' | 'invited' | 'declined'): Promise<void> {
    await apiFetch(`/api/events/${id}/rsvp`, { method: 'POST', body: JSON.stringify({ rsvp }) })
    await refresh()
  }

  async function patch(changes: EventPatch): Promise<void> {
    await apiFetch(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(changes) })
    await refresh()
  }

  async function createInviteLink(): Promise<string> {
    const body = await apiFetch<{ url: string }>(`/api/events/${id}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'link' }),
    })
    return body.url
  }

  async function inviteByEmail(email: string): Promise<void> {
    await apiFetch(`/api/events/${id}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'email', email }),
    })
  }

  onMounted(refresh)

  return { state, event, error, refresh, setRsvp, patch, createInviteLink, inviteByEmail }
}
