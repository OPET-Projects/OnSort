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
  <section class="flex flex-col gap-6">
    <!--
      Les créneaux libres d'abord : c'est la réponse à la question posée. Les occupations
      viennent ensuite, comme justification de cette réponse.
    -->
    <div class="flex flex-col gap-2">
      <h2 class="text-[13px] font-semibold text-label">Quand tout le monde est libre</h2>

      <p
        v-if="free.length === 0"
        class="rounded-card border border-dashed border-field p-5 text-[13px] leading-relaxed text-muted"
      >
        Aucun créneau ne convient à tout le monde sur les {{ windowDays }} prochains jours.
        Élargissez la fenêtre, ou raccourcissez la durée minimale.
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="slot in free"
          :key="slot.startsAt"
          class="flex flex-wrap items-center justify-between gap-2 rounded-field border border-free-line bg-free px-4 py-3"
        >
          <span class="text-sm font-semibold text-free-ink-strong">
            {{ formatSlot(slot.startsAt, slot.endsAt) }}
          </span>
          <span class="text-xs font-semibold text-free-ink">
            {{ formatDuration(slot.startsAt, slot.endsAt) }}
          </span>
        </li>
      </ul>
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-[13px] font-semibold text-label">Qui est occupé</h2>

      <p v-if="busy.length === 0" class="text-[13px] text-muted">
        Personne n'a déclaré d'indisponibilité sur cette période.
      </p>

      <ul v-else class="flex flex-col rounded-card border border-line bg-surface">
        <li
          v-for="span in busy"
          :key="`${span.userId}-${span.startsAt}`"
          class="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft px-4 py-3 last:border-b-0"
        >
          <span class="text-sm font-medium">{{ span.name }}</span>
          <span class="text-xs text-muted">
            {{ formatSlot(span.startsAt, span.endsAt) }}
          </span>
        </li>
      </ul>

      <!-- Le motif est privé (conception §2.4) : le groupe ne voit que « occupé ». -->
      <p v-if="busy.length > 0" class="text-xs leading-relaxed text-faint">
        Le motif d'une indisponibilité reste privé.
      </p>
    </div>
  </section>
</template>
