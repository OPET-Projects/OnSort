import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type Tally = { for: number; against: number }
export type VoteValue = 'for' | 'against'
export type ActivityStatus = 'proposed' | 'accepted' | 'rejected'

export type Activity = {
  id: string
  title: string
  kind: string
  address: string
  startsAt: string | null
  endsAt: string | null
  // Posées par le géocodage de l'adresse, ou nulles : une activité sans lieu reconnu reste
  // valide, elle n'apparaît simplement pas sur la carte.
  lat: number | null
  lng: number | null
  position: number
  status: ActivityStatus
  proposedBy: { participantId: string; name: string }
  tally: Tally
  myVote: VoteValue | null
}

export type ProposeInput = {
  title: string
  kind?: string
  address?: string
  startsAt?: string | null
  endsAt?: string | null
}

// Programme d'un événement : liste, proposition, vote, décision. Monté et détruit avec la
// vue, comme l'état d'un événement (conception §6.2).
export function useActivities(eventId: string) {
  const state = ref<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const activities = ref<Activity[]>([])
  const error = ref('')

  async function reload(): Promise<void> {
    try {
      const body = await apiFetch<{ activities: Activity[] }>(`/api/events/${eventId}/activities`)
      activities.value = body.activities
      state.value = body.activities.length === 0 ? 'empty' : 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      state.value = 'error'
    }
  }

  // Applique un décompte sans recharger la liste. Appelé après un vote local et à réception
  // d'un `activity.vote` sur le flux temps réel — c'est ce qui fait bouger le compteur en
  // direct (conception §5.2, §6.4).
  function applyTally(activityId: string, tally: Tally, myVote?: VoteValue): void {
    const activity = activities.value.find((candidate) => candidate.id === activityId)

    if (activity === undefined) {
      return
    }

    activity.tally = tally

    if (myVote !== undefined) {
      activity.myVote = myVote
    }
  }

  async function propose(input: ProposeInput): Promise<void> {
    await apiFetch(`/api/events/${eventId}/activities`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await reload()
  }

  async function vote(activityId: string, value: VoteValue): Promise<void> {
    const tally = await apiFetch<Tally>(`/api/activities/${activityId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    })
    applyTally(activityId, tally, value)
  }

  async function decide(activityId: string, status: ActivityStatus): Promise<void> {
    await apiFetch(`/api/activities/${activityId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    })
    await reload()
  }

  onMounted(reload)

  return { state, activities, error, reload, applyTally, propose, vote, decide }
}
