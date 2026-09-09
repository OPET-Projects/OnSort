<script setup lang="ts">
import type { BusySpan, Slot } from '../composables/useGroup'
import { formatDuration, formatSlot } from '../lib/slots'

defineProps<{
  free: Slot[]
  busy: BusySpan[]
  windowDays: number
}>()
</script>

<template>
  <section>
    <!--
      Les créneaux libres d'abord : c'est la réponse à la question posée. Les occupations
      viennent ensuite, comme justification de cette réponse.
    -->
    <h2 class="text-sm font-medium">Quand tout le monde est libre</h2>

    <p v-if="free.length === 0" class="mt-2 text-sm text-neutral-600">
      Aucun créneau ne convient à tout le monde sur les {{ windowDays }} prochains jours.
      Élargissez la fenêtre, ou raccourcissez la durée minimale.
    </p>

    <ul v-else class="mt-2 flex flex-col gap-2">
      <li
        v-for="slot in free"
        :key="slot.startsAt"
        class="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm"
      >
        <span class="font-medium">{{ formatSlot(slot.startsAt, slot.endsAt) }}</span>
        <span class="ml-1 text-xs text-emerald-800">
          · {{ formatDuration(slot.startsAt, slot.endsAt) }}
        </span>
      </li>
    </ul>

    <div class="mt-6">
      <h2 class="text-sm font-medium">Qui est occupé</h2>

      <p v-if="busy.length === 0" class="mt-2 text-sm text-neutral-600">
        Personne n'a déclaré d'indisponibilité sur cette période.
      </p>

      <ul v-else class="mt-2 divide-y divide-neutral-100">
        <li
          v-for="span in busy"
          :key="`${span.userId}-${span.startsAt}`"
          class="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
        >
          <span>{{ span.name }}</span>
          <span class="text-xs text-neutral-500">
            {{ formatSlot(span.startsAt, span.endsAt) }}
          </span>
        </li>
      </ul>

      <!-- Le motif est privé (conception §2.4) : le groupe ne voit que « occupé ». -->
      <p v-if="busy.length > 0" class="mt-2 text-xs text-neutral-500">
        Le motif d'une indisponibilité reste privé.
      </p>
    </div>
  </section>
</template>
