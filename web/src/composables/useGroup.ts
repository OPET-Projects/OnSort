import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type GroupMember = {
  userId: string
  name: string
  role: 'admin' | 'member'
  joinedAt: string
}

export type GroupDetail = {
  id: string
  name: string
  createdBy: string
  members: GroupMember[]
  viewer: { role: 'admin' | 'member' }
}

export type BusySpan = {
  userId: string
  name: string
  startsAt: string
  endsAt: string
}

export type Slot = {
  startsAt: string
  endsAt: string
}

export type GroupCalendar = {
  from: string
  to: string
  busy: BusySpan[]
  free: Slot[]
}

// Fenêtre par défaut : les trente prochains jours. La borne haute de l'API est 90 jours ;
// trente suffisent à trouver une date et gardent la réponse lisible.
const DEFAULT_WINDOW_DAYS = 30

// Durée minimale d'un créneau retenu. Un trou d'une heure entre deux absences n'est pas une
// sortie, et l'afficher noierait les vrais créneaux.
const DEFAULT_MINIMUM_MINUTES = 120

export function useGroup(groupId: string) {
  const state = ref<'loading' | 'error' | 'ready'>('loading')
  const group = ref<GroupDetail | null>(null)
  const calendar = ref<GroupCalendar | null>(null)
  const error = ref('')
  const inviteSent = ref(false)

  const windowDays = ref(DEFAULT_WINDOW_DAYS)
  const minimumMinutes = ref(DEFAULT_MINIMUM_MINUTES)

  async function reload(): Promise<void> {
    try {
      const from = new Date()
      const to = new Date(from.getTime() + windowDays.value * 86_400_000)

      const query = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        minimumMinutes: String(minimumMinutes.value),
      })

      // Les deux voyagent ensemble : la fiche du groupe sans son calendrier n'aurait rien à
      // montrer, et le calendrier sans la fiche ne dirait pas de qui il parle.
      const [detail, overlay] = await Promise.all([
        apiFetch<{ group: GroupDetail }>(`/api/groups/${groupId}`),
        apiFetch<GroupCalendar>(`/api/groups/${groupId}/calendar?${query}`),
      ])

      group.value = detail.group
      calendar.value = overlay
      state.value = 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      state.value = 'error'
    }
  }

  // La réponse est identique que l'adresse ait un compte ou non (conception §4) :
  // l'interface ne peut donc dire que « si un compte existe, l'invitation est partie ».
  async function invite(email: string): Promise<void> {
    await apiFetch(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    inviteSent.value = true
  }

  onMounted(reload)

  return {
    state,
    group,
    calendar,
    error,
    inviteSent,
    windowDays,
    minimumMinutes,
    reload,
    invite,
  }
}
