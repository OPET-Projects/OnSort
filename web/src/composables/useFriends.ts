import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type Friend = {
  userId: string
  name: string
  since: string
}

export type IncomingRequest = {
  id: string
  from: { userId: string; name: string }
  createdAt: string
}

export type OutgoingRequest = {
  id: string
  to: { userId: string; name: string }
  createdAt: string
}

type FriendsBody = {
  friends: Friend[]
  received: IncomingRequest[]
  sent: OutgoingRequest[]
}

export function useFriends() {
  const state = ref<'loading' | 'error' | 'ready'>('loading')
  const friends = ref<Friend[]>([])
  const received = ref<IncomingRequest[]>([])
  const sent = ref<OutgoingRequest[]>([])
  const error = ref('')
  const requestSent = ref(false)

  async function reload(): Promise<void> {
    try {
      const body = await apiFetch<FriendsBody>('/api/friends')
      friends.value = body.friends
      received.value = body.received
      sent.value = body.sent
      state.value = 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      state.value = 'error'
    }
  }

  // La réponse de l'API est identique que le compte existe ou non (conception §4).
  // L'interface ne peut donc rien affirmer de plus que « quelque chose est parti ».
  async function ask(email: string): Promise<void> {
    await apiFetch('/api/friends/requests', { method: 'POST', body: JSON.stringify({ email }) })
    requestSent.value = true
    await reload()
  }

  async function accept(requestId: string): Promise<void> {
    await apiFetch(`/api/friends/requests/${requestId}/accept`, { method: 'POST' })
    await reload()
  }

  async function decline(requestId: string): Promise<void> {
    await apiFetch(`/api/friends/requests/${requestId}/decline`, { method: 'POST' })
    await reload()
  }

  onMounted(reload)

  return { state, friends, received, sent, error, requestSent, reload, ask, accept, decline }
}
