<script setup lang="ts">
import { computed } from 'vue'
import type { Activity } from '../../composables/useActivities'
import type { Participant } from '../../composables/useEvent'
import { rsvpLabel } from '../../lib/event-labels'

const props = defineProps<{
  participants: Participant[]
  activities: Activity[]
}>()

// Le programme retenu, montré à part sur grand écran : c'est ce que l'organisateur regarde
// en dernier, une fois les votes tranchés.
const accepted = computed(() =>
  props.activities.filter((activity) => activity.status === 'accepted'),
)
</script>

<!--
  Colonne de rappel, sur grand écran seulement : sur téléphone elle répéterait mot pour mot
  l'onglet ouvert juste à côté.
-->
<template>
  <aside class="hidden md:flex md:flex-col md:gap-3">
    <div class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4 shadow-rest">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">Participants</h2>
        <span class="text-xs text-faint">{{ participants.length }}</span>
      </div>
      <ul class="flex flex-col gap-2.5">
        <li
          v-for="participant in participants"
          :key="participant.userId"
          class="flex items-center gap-2.5"
        >
          <span
            class="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-press"
          >
            {{ participant.name.slice(0, 2).toUpperCase() }}
          </span>
          <span class="min-w-0 flex-1 truncate text-[13px] font-medium">
            {{ participant.name }}
          </span>
          <span
            class="shrink-0 text-xs font-semibold"
            :class="
              participant.rsvp === 'accepted'
                ? 'text-free-ink'
                : participant.rsvp === 'declined'
                  ? 'text-fail-ink'
                  : 'text-wait-ink'
            "
          >
            {{ rsvpLabel[participant.rsvp] }}
          </span>
        </li>
      </ul>
    </div>

    <div
      v-if="accepted.length > 0"
      class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4 shadow-rest"
    >
      <h2 class="text-sm font-semibold">Le programme retenu</h2>
      <ol class="flex flex-col gap-2.5">
        <li v-for="(activity, index) in accepted" :key="activity.id" class="flex items-center gap-2.5">
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white"
          >
            {{ index + 1 }}
          </span>
          <span class="min-w-0 flex-1 truncate text-[13px]">{{ activity.title }}</span>
        </li>
      </ol>
    </div>

    <p
      class="flex items-center gap-2.5 rounded-card border border-free-line bg-free px-4 py-3 text-xs leading-relaxed text-free-ink-strong"
    >
      <span class="h-2 w-2 shrink-0 rounded-full bg-free-ink"></span>
      En direct · votes et dépenses arrivent sans rechargement.
    </p>
  </aside>
</template>
