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
  if (balanceCents > 0) return 'text-free-ink'
  if (balanceCents < 0) return 'text-fail-ink'
  return 'text-muted'
}
</script>

<template>
  <section class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <h2 class="text-[13px] font-semibold text-label">Soldes</h2>
      <ul class="flex flex-col rounded-card border border-line bg-surface">
        <li
          v-for="balance in balances"
          :key="balance.participantId"
          class="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
        >
          <span class="text-sm" :class="balance.you ? 'font-semibold' : 'font-medium'">
            {{ balance.you ? 'Vous' : balance.name }}
          </span>
          <span class="text-sm font-semibold" :class="toneOf(balance.balanceCents)">
            {{ formatCents(balance.balanceCents) }}
          </span>
        </li>
      </ul>
    </div>

    <div class="flex flex-col gap-2">
      <h2 class="text-[13px] font-semibold text-label">Virements à faire</h2>

      <p
        v-if="transfers.length === 0"
        class="rounded-card border border-free-line bg-free px-4 py-3 text-[13px] text-free-ink-strong"
      >
        Tout est réglé. Personne ne doit rien à personne.
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="transfer in transfers"
          :key="`${transfer.fromParticipantId}-${transfer.toParticipantId}`"
          class="flex flex-wrap items-center justify-between gap-2.5 rounded-field border border-line bg-surface px-4 py-3"
        >
          <span class="text-sm">
            {{ isDebtor(transfer) ? 'Vous devez' : `${transfer.fromName} doit` }}
            <strong class="font-bold">{{ formatCents(transfer.amountCents) }}</strong>
            à {{ transfer.toName }}
          </span>
          <button
            v-if="isDebtor(transfer)"
            type="button"
            class="flex h-11 shrink-0 items-center rounded-control bg-accent px-3.5 text-[13px] font-semibold text-white"
            @click="emit('declare', transfer.toParticipantId, transfer.amountCents)"
          >
            J'ai envoyé
          </button>
        </li>
      </ul>
    </div>

    <div v-if="pendingSettlements.length > 0" class="flex flex-col gap-2">
      <h2 class="text-[13px] font-semibold text-label">En attente de confirmation</h2>
      <p class="text-xs leading-relaxed text-faint">
        Un virement déclaré ne bouge le solde qu'une fois confirmé par celui qui le reçoit.
      </p>

      <ul class="flex flex-col gap-2">
        <li
          v-for="settlement in pendingSettlements"
          :key="settlement.id"
          class="flex flex-wrap items-center justify-between gap-2.5 rounded-field border border-line bg-surface px-4 py-3"
        >
          <span class="text-sm">
            {{ canWithdraw(settlement) ? 'Vous avez déclaré' : `${settlement.fromName} a déclaré` }}
            <strong class="font-bold">{{ formatCents(settlement.amountCents) }}</strong>
            à {{ canConfirm(settlement) ? 'vous' : settlement.toName }}
          </span>
          <button
            v-if="canConfirm(settlement)"
            type="button"
            class="flex h-11 shrink-0 items-center rounded-control bg-accent px-3.5 text-[13px] font-semibold text-white"
            @click="emit('confirm', settlement.id)"
          >
            J'ai reçu
          </button>
          <button
            v-else-if="canWithdraw(settlement)"
            type="button"
            class="flex h-11 shrink-0 items-center rounded-control border border-field px-3.5 text-[13px] font-medium text-ink-2"
            @click="emit('withdraw', settlement.id)"
          >
            Retirer
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
