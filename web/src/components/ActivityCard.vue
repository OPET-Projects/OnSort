<script setup lang="ts">
import { computed } from 'vue'
import type { Activity, ActivityStatus, VoteValue } from '../composables/useActivities'
import { formatPeriod } from '../lib/dates'

const props = defineProps<{
  activity: Activity
  canVote: boolean
  isAdmin: boolean
}>()

const emit = defineEmits<{
  vote: [activityId: string, value: VoteValue]
  decide: [activityId: string, status: ActivityStatus]
}>()

const statusLabel: Record<ActivityStatus, string> = {
  proposed: 'Proposée',
  accepted: 'Retenue',
  rejected: 'Écartée',
}

const isOpen = computed(() => props.activity.status === 'proposed')

// Une seule phrase dit pourquoi le vote est fermé, plutôt qu'un bouton grisé sans
// explication.
const closedReason = computed(() => {
  if (!isOpen.value) return "Le vote est clos : l'activité a été tranchée."
  if (!props.canVote) return "Acceptez l'événement pour voter."
  return ''
})

const schedule = computed(() => {
  const { startsAt, endsAt } = props.activity
  return startsAt !== null && endsAt !== null ? formatPeriod(startsAt, endsAt) : ''
})
</script>

<template>
  <article class="rounded border border-neutral-200 p-4">
    <header class="flex items-baseline justify-between gap-3">
      <h3 class="font-medium">{{ activity.title }}</h3>
      <span class="shrink-0 text-xs text-neutral-500">{{ statusLabel[activity.status] }}</span>
    </header>

    <p v-if="activity.kind" class="mt-1 text-xs text-neutral-500">{{ activity.kind }}</p>
    <p v-if="activity.address" class="mt-1 text-sm text-neutral-600">{{ activity.address }}</p>
    <p v-if="schedule" class="mt-1 text-sm text-neutral-600">{{ schedule }}</p>
    <p class="mt-2 text-xs text-neutral-500">Proposée par {{ activity.proposedBy.name }}</p>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        :disabled="!isOpen || !canVote"
        class="rounded px-3 py-1 text-sm disabled:opacity-40"
        :class="
          activity.myVote === 'for' ? 'bg-neutral-900 text-white' : 'border border-neutral-300'
        "
        @click="emit('vote', activity.id, 'for')"
      >
        Pour · {{ activity.tally.for }}
      </button>
      <button
        type="button"
        :disabled="!isOpen || !canVote"
        class="rounded px-3 py-1 text-sm disabled:opacity-40"
        :class="
          activity.myVote === 'against' ? 'bg-neutral-900 text-white' : 'border border-neutral-300'
        "
        @click="emit('vote', activity.id, 'against')"
      >
        Contre · {{ activity.tally.against }}
      </button>
    </div>

    <p v-if="closedReason" class="mt-2 text-xs text-neutral-500">{{ closedReason }}</p>

    <div v-if="isAdmin" class="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
      <button
        v-if="activity.status !== 'accepted'"
        type="button"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
        @click="emit('decide', activity.id, 'accepted')"
      >
        Retenir
      </button>
      <button
        v-if="activity.status !== 'rejected'"
        type="button"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
        @click="emit('decide', activity.id, 'rejected')"
      >
        Écarter
      </button>
      <button
        v-if="activity.status !== 'proposed'"
        type="button"
        class="rounded border border-neutral-300 px-3 py-1 text-sm"
        @click="emit('decide', activity.id, 'proposed')"
      >
        Rouvrir le vote
      </button>
    </div>
  </article>
</template>
