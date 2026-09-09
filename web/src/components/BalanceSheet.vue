<script setup lang="ts">
import type { Balance, PendingSettlement, Transfer } from '../composables/useExpenses'
import { formatCents } from '../lib/money'

const props = defineProps<{
  balances: Balance[]
  transfers: Transfer[]
  pendingSettlements: PendingSettlement[]
  viewerId: string
}>()

const emit = defineEmits<{
  declare: [toParticipantId: string, amountCents: number]
  confirm: [settlementId: string]
  withdraw: [settlementId: string]
}>()

// Déclarer est réservé au débiteur, confirmer au créancier (conception §3.8). L'interface
// applique la même règle que l'API : afficher un bouton qui répondrait 403 serait un
// mensonge d'interface.
const isDebtor = (transfer: Transfer) => transfer.fromParticipantId === props.viewerId
const canConfirm = (settlement: PendingSettlement) => settlement.toParticipantId === props.viewerId
const canWithdraw = (settlement: PendingSettlement) =>
  settlement.fromParticipantId === props.viewerId

const toneOf = (balanceCents: number) => {
  if (balanceCents > 0) return 'text-emerald-700'
  if (balanceCents < 0) return 'text-red-700'
  return 'text-neutral-500'
}
</script>

<template>
  <section>
    <h2 class="text-sm font-medium">Soldes</h2>
    <ul class="mt-2 divide-y divide-neutral-100">
      <li
        v-for="balance in balances"
        :key="balance.participantId"
        class="flex items-center justify-between py-2 text-sm"
      >
        <span :class="balance.you ? 'font-medium' : ''">
          {{ balance.you ? 'Vous' : balance.name }}
        </span>
        <span :class="toneOf(balance.balanceCents)">{{ formatCents(balance.balanceCents) }}</span>
      </li>
    </ul>

    <div class="mt-6">
      <h2 class="text-sm font-medium">Virements à faire</h2>

      <p v-if="transfers.length === 0" class="mt-2 text-sm text-neutral-600">
        Tout est réglé. Personne ne doit rien à personne.
      </p>

      <ul v-else class="mt-2 flex flex-col gap-2">
        <li
          v-for="transfer in transfers"
          :key="`${transfer.fromParticipantId}-${transfer.toParticipantId}`"
          class="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 p-3 text-sm"
        >
          <span>
            {{ isDebtor(transfer) ? 'Vous devez' : `${transfer.fromName} doit` }}
            <strong>{{ formatCents(transfer.amountCents) }}</strong>
            à {{ transfer.toName }}
          </span>
          <button
            v-if="isDebtor(transfer)"
            type="button"
            class="rounded bg-neutral-900 px-3 py-1 text-xs text-white"
            @click="emit('declare', transfer.toParticipantId, transfer.amountCents)"
          >
            J'ai envoyé
          </button>
        </li>
      </ul>
    </div>

    <div v-if="pendingSettlements.length > 0" class="mt-6">
      <h2 class="text-sm font-medium">En attente de confirmation</h2>
      <p class="mt-1 text-xs text-neutral-500">
        Un virement déclaré ne bouge le solde qu'une fois confirmé par celui qui le reçoit.
      </p>

      <ul class="mt-2 flex flex-col gap-2">
        <li
          v-for="settlement in pendingSettlements"
          :key="settlement.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 p-3 text-sm"
        >
          <span>
            {{ canWithdraw(settlement) ? 'Vous avez déclaré' : `${settlement.fromName} a déclaré` }}
            <strong>{{ formatCents(settlement.amountCents) }}</strong>
            à {{ canConfirm(settlement) ? 'vous' : settlement.toName }}
          </span>
          <button
            v-if="canConfirm(settlement)"
            type="button"
            class="rounded bg-neutral-900 px-3 py-1 text-xs text-white"
            @click="emit('confirm', settlement.id)"
          >
            J'ai reçu
          </button>
          <button
            v-else-if="canWithdraw(settlement)"
            type="button"
            class="rounded border border-neutral-300 px-3 py-1 text-xs"
            @click="emit('withdraw', settlement.id)"
          >
            Retirer
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
