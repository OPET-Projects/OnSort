<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Participant } from '../../composables/useEvent'
import type {
  Balance,
  Expense,
  PendingSettlement,
  RecordInput,
  SplitMode,
  Transfer,
} from '../../composables/useExpenses'
import { formatCents, parseEurosToCents } from '../../lib/money'
import BalanceSheet from '../BalanceSheet.vue'
import ExpenseCard from '../ExpenseCard.vue'

const props = defineProps<{
  state: 'loading' | 'empty' | 'error' | 'ready'
  expenses: Expense[]
  balances: Balance[]
  transfers: Transfer[]
  pendingSettlements: PendingSettlement[]
  error: string
  participants: Participant[]
  viewerId: string
  hasAccepted: boolean
  reload: () => Promise<void>
  record: (input: RecordInput) => Promise<void>
  declare: (toParticipantId: string, amountCents: number) => Promise<void>
  confirm: (settlementId: string) => Promise<void>
  withdraw: (settlementId: string) => Promise<void>
}>()

const spending = ref({ label: '', amount: '', splitMode: 'equal' as SplitMode })
const spendingError = ref('')

// Une saisie par bénéficiaire, indexée par participation : un pourcentage entier en mode
// `percent`, des euros en mode `fixed`. Une case laissée vide vaut zéro — quelqu'un peut ne
// rien devoir sur une dépense dont il bénéficie.
const splitEntries = ref<Record<string, string>>({})

// Les bénéficiaires possibles sont ceux qui ont accepté, comme côté API (§3.4).
const beneficiaries = computed(() =>
  props.participants.filter((participant) => participant.rsvp === 'accepted'),
)

const spendingAmountCents = computed(() => parseEurosToCents(spending.value.amount))

const percentEntered = computed(() =>
  beneficiaries.value.reduce(
    (sum, participant) =>
      sum + Math.trunc(Number(splitEntries.value[participant.participantId]) || 0),
    0,
  ),
)

const fixedEnteredCents = computed(() =>
  beneficiaries.value.reduce((sum, participant) => {
    const cents = parseEurosToCents(splitEntries.value[participant.participantId] ?? '')
    return sum + (Number.isFinite(cents) ? cents : 0)
  }, 0),
)

// Le décalage s'affiche en direct : un formulaire qui n'indique pas qu'il manque 3 % se
// solde par un refus incompréhensible.
const splitHint = computed(() => {
  if (spending.value.splitMode === 'percent') {
    const gap = 100 - percentEntered.value
    if (gap === 0) return 'Total : 100 %.'
    return gap > 0
      ? `Total : ${percentEntered.value} % — il manque ${gap} %.`
      : `Total : ${percentEntered.value} % — ${-gap} % de trop.`
  }

  if (spending.value.splitMode === 'fixed') {
    const total = Number.isFinite(spendingAmountCents.value) ? spendingAmountCents.value : 0
    const gap = total - fixedEnteredCents.value
    if (gap === 0) return `Total : ${formatCents(fixedEnteredCents.value)}.`
    return gap > 0
      ? `Total : ${formatCents(fixedEnteredCents.value)} — il manque ${formatCents(gap)}.`
      : `Total : ${formatCents(fixedEnteredCents.value)} — ${formatCents(-gap)} de trop.`
  }

  return "La dépense est partagée à parts égales entre ceux qui ont accepté l'événement."
})

async function submitExpense(): Promise<void> {
  spendingError.value = ''
  const amountCents = spendingAmountCents.value

  // Le montant est refusé ici, avec le contexte du formulaire, plutôt que dans
  // `parseEurosToCents` qui n'aurait pas de quoi rédiger le message.
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    spendingError.value = 'Saisissez un montant en euros, supérieur à zéro.'
    return
  }

  const mode = spending.value.splitMode

  if (mode === 'percent' && percentEntered.value !== 100) {
    spendingError.value = 'Les pourcentages doivent totaliser 100.'
    return
  }

  if (mode === 'fixed' && fixedEnteredCents.value !== amountCents) {
    spendingError.value = 'La somme des parts doit faire le montant de la dépense.'
    return
  }

  try {
    if (mode === 'percent') {
      await props.record({
        label: spending.value.label,
        amountCents,
        splitMode: 'percent',
        shares: beneficiaries.value.map((participant) => ({
          participantId: participant.participantId,
          percent: Math.trunc(Number(splitEntries.value[participant.participantId]) || 0),
        })),
      })
    } else if (mode === 'fixed') {
      await props.record({
        label: spending.value.label,
        amountCents,
        splitMode: 'fixed',
        shares: beneficiaries.value.map((participant) => {
          const cents = parseEurosToCents(splitEntries.value[participant.participantId] ?? '')
          return {
            participantId: participant.participantId,
            amountCents: Number.isFinite(cents) ? cents : 0,
          }
        }),
      })
    } else {
      await props.record({ label: spending.value.label, amountCents })
    }

    spending.value = { label: '', amount: '', splitMode: 'equal' }
    splitEntries.value = {}
  } catch (cause) {
    spendingError.value = cause instanceof Error ? cause.message : 'La saisie a échoué.'
  }
}

const settlementError = ref('')

async function runSettlement(action: () => Promise<void>): Promise<void> {
  settlementError.value = ''
  try {
    await action()
  } catch (cause) {
    settlementError.value = cause instanceof Error ? cause.message : "L'opération a échoué."
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <p v-if="state === 'loading'" class="text-sm text-muted">Chargement des dépenses…</p>

    <div
      v-else-if="state === 'error'"
      class="flex flex-col items-start gap-3 rounded-card border border-fail-line bg-fail p-5"
    >
      <p class="text-sm text-fail-ink">{{ error }}</p>
      <button
        type="button"
        class="flex h-10 items-center rounded-control border border-fail-line bg-surface px-4 text-sm font-semibold text-fail-ink"
        @click="reload()"
      >
        Réessayer
      </button>
    </div>

    <template v-else>
      <p
        v-if="state === 'empty'"
        class="rounded-card border border-dashed border-field p-6 text-center text-[13px] leading-relaxed text-muted"
      >
        Aucune dépense pour l'instant. Saisissez la première pour que les comptes démarrent.
      </p>

      <div v-else class="flex flex-col gap-2.5">
        <ExpenseCard
          v-for="expense in expenses"
          :key="expense.id"
          :expense="expense"
          :viewer-id="viewerId"
        />
      </div>

      <form
        v-if="hasAccepted"
        class="flex flex-col gap-2.5 rounded-card border border-dashed border-field p-4"
        @submit.prevent="submitExpense"
      >
        <h2 class="text-sm font-semibold">Saisir une dépense</h2>
        <input
          v-model="spending.label"
          aria-label="Objet de la dépense"
          type="text"
          required
          maxlength="200"
          placeholder="Restaurant, taxi, billets…"
          class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        <input
          v-model="spending.amount"
          aria-label="Montant en euros"
          type="text"
          inputmode="decimal"
          required
          placeholder="Montant en euros"
          class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        <select
          v-model="spending.splitMode"
          aria-label="Mode de partage"
          class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        >
          <option value="equal">À parts égales</option>
          <option value="percent">En pourcentage</option>
          <option value="fixed">En montant fixe</option>
        </select>

        <div v-if="spending.splitMode !== 'equal'" class="flex flex-col gap-2">
          <label
            v-for="participant in beneficiaries"
            :key="participant.participantId"
            class="flex items-center justify-between gap-3 text-[13px]"
          >
            <span class="min-w-0 truncate text-ink-2">{{ participant.name }}</span>
            <span class="flex shrink-0 items-center gap-1.5">
              <input
                v-model="splitEntries[participant.participantId]"
                type="text"
                inputmode="decimal"
                :placeholder="spending.splitMode === 'percent' ? '0' : '0,00'"
                class="h-11 w-24 rounded-control border border-field bg-surface px-2.5 text-right text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
              />
              <span class="text-muted">{{ spending.splitMode === 'percent' ? '%' : '€' }}</span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          class="flex h-12 items-center justify-center rounded-control bg-accent text-sm font-semibold text-white"
        >
          Enregistrer
        </button>
        <p class="text-xs leading-relaxed text-faint">{{ splitHint }}</p>
        <p v-if="spendingError" class="text-sm text-fail-ink">{{ spendingError }}</p>
      </form>

      <p v-else class="rounded-field bg-fill p-3.5 text-[13px] leading-relaxed text-ink-2">
        Acceptez l'événement pour saisir une dépense.
      </p>

      <div class="border-t border-line-soft pt-5">
        <BalanceSheet
          :balances="balances"
          :transfers="transfers"
          :pending-settlements="pendingSettlements"
          :viewer-id="viewerId"
          @declare="(to, amount) => runSettlement(() => declare(to, amount))"
          @confirm="(settlementId) => runSettlement(() => confirm(settlementId))"
          @withdraw="(settlementId) => runSettlement(() => withdraw(settlementId))"
        />
        <p v-if="settlementError" class="mt-2 text-sm text-fail-ink">{{ settlementError }}</p>
      </div>
    </template>
  </section>
</template>
