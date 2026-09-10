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
  <article class="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-rest">
    <header class="flex items-start justify-between gap-2.5">
      <span class="flex min-w-0 flex-col gap-0.5">
        <h3 class="text-base font-semibold">{{ activity.title }}</h3>
        <span v-if="activity.address" class="text-[13px] text-muted">{{ activity.address }}</span>
        <span v-if="activity.kind" class="text-xs text-faint">{{ activity.kind }}</span>
        <span v-if="schedule" class="text-[13px] text-ink-2">{{ schedule }}</span>
      </span>
      <span
        class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
        :class="
          activity.status === 'accepted'
            ? 'bg-free text-free-ink'
            : activity.status === 'rejected'
              ? 'bg-fail text-fail-ink'
              : 'bg-fill text-muted'
        "
      >
        {{ statusLabel[activity.status] }}
      </span>
    </header>

    <div class="flex gap-2">
      <button
        type="button"
        :disabled="!isOpen || !canVote"
        class="flex h-11 flex-1 items-center justify-center rounded-control text-sm disabled:opacity-40"
        :class="
          activity.myVote === 'for'
            ? 'bg-accent font-semibold text-white'
            : 'border border-field font-medium text-ink-2'
        "
        @click="emit('vote', activity.id, 'for')"
      >
        Pour · {{ activity.tally.for }}
      </button>
      <button
        type="button"
        :disabled="!isOpen || !canVote"
        class="flex h-11 flex-1 items-center justify-center rounded-control text-sm disabled:opacity-40"
        :class="
          activity.myVote === 'against'
            ? 'bg-accent font-semibold text-white'
            : 'border border-field font-medium text-ink-2'
        "
        @click="emit('vote', activity.id, 'against')"
      >
        Contre · {{ activity.tally.against }}
      </button>
    </div>

    <p class="text-xs text-faint">Proposée par {{ activity.proposedBy.name }}</p>
    <p v-if="closedReason" class="text-xs text-faint">{{ closedReason }}</p>

    <div v-if="isAdmin" class="flex flex-wrap gap-2 border-t border-line-soft pt-3">
      <button
        v-if="activity.status !== 'accepted'"
        type="button"
        class="flex h-11 items-center rounded-control border border-field px-3.5 text-sm font-medium text-ink-2"
        @click="emit('decide', activity.id, 'accepted')"
      >
        Retenir
      </button>
      <button
        v-if="activity.status !== 'rejected'"
        type="button"
        class="flex h-11 items-center rounded-control border border-field px-3.5 text-sm font-medium text-ink-2"
        @click="emit('decide', activity.id, 'rejected')"
      >
        Écarter
      </button>
      <button
        v-if="activity.status !== 'proposed'"
        type="button"
        class="flex h-11 items-center rounded-control border border-field px-3.5 text-sm font-medium text-ink-2"
        @click="emit('decide', activity.id, 'proposed')"
      >
        Rouvrir le vote
      </button>
    </div>
  </article>
</template>
