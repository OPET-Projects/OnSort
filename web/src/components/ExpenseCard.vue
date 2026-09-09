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
  <article class="rounded border border-neutral-200 p-4">
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="font-medium">{{ expense.label }}</h3>
      <span class="shrink-0 text-sm font-medium">{{ formatCents(expense.amountCents) }}</span>
    </div>

    <p class="mt-1 text-sm text-neutral-600">
      {{ payer }}, partagé entre {{ expense.shares.length }}
      {{ expense.shares.length > 1 ? 'personnes' : 'personne' }}
    </p>

    <p v-if="myShare !== undefined" class="mt-2 text-xs text-neutral-500">
      Votre part : {{ formatCents(myShare) }}
    </p>
    <p v-else class="mt-2 text-xs text-neutral-500">Vous n'êtes pas concerné par cette dépense.</p>
  </article>
</template>
