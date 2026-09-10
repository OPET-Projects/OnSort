<script setup lang="ts">
import { computed } from 'vue'
import type { Expense } from '../composables/useExpenses'
import { formatCents } from '../lib/money'

const props = defineProps<{
  expense: Expense
  viewerId: string
}>()

// La part de l'appelant est ce qu'il cherche en premier : « combien cette dépense me
// coûte », pas « combien elle a coûté ».
const myShare = computed(
  () => props.expense.shares.find((share) => share.participantId === props.viewerId)?.amountCents,
)

const payer = computed(() =>
  props.expense.paidBy.participantId === props.viewerId
    ? 'Vous avez avancé'
    : `${props.expense.paidBy.name} a avancé`,
)
</script>

<template>
  <article class="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-rest">
    <span class="flex min-w-0 flex-col gap-0.5">
      <h3 class="truncate text-sm font-semibold">{{ expense.label }}</h3>
      <span class="text-xs text-faint">
        {{ payer }} · {{ expense.shares.length }}
        {{ expense.shares.length > 1 ? 'parts' : 'part' }}
        <template v-if="myShare !== undefined">· la vôtre : {{ formatCents(myShare) }}</template>
        <template v-else>· vous n'êtes pas concerné</template>
      </span>
    </span>
    <span class="shrink-0 text-[15px] font-semibold">{{ formatCents(expense.amountCents) }}</span>
  </article>
</template>
