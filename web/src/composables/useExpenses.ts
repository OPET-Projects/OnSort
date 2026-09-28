import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type SplitMode = 'equal' | 'percent' | 'fixed'

export type Expense = {
  id: string
  label: string
  amountCents: number
  currency: string
  activityId: string | null
  splitMode: SplitMode
  createdAt: string
  paidBy: { participantId: string; name: string }
  shares: { participantId: string; amountCents: number }[]
}

export type Balance = {
  participantId: string
  name: string
  balanceCents: number
  you: boolean
}

export type Transfer = {
  fromParticipantId: string
  toParticipantId: string
  fromName: string
  toName: string
  amountCents: number
}

// Parts d'une dépense, dans la forme que le mode impose : un pourcentage entier, ou un
// montant en centimes. L'API refuse l'une des deux formes sous l'autre mode.
export type PercentShare = { participantId: string; percent: number }
export type FixedShare = { participantId: string; amountCents: number }

export type RecordInput =
  | { label: string; amountCents: number; splitMode?: 'equal' }
  | { label: string; amountCents: number; splitMode: 'percent'; shares: PercentShare[] }
  | { label: string; amountCents: number; splitMode: 'fixed'; shares: FixedShare[] }

export type PendingSettlement = {
  id: string
  fromParticipantId: string
  toParticipantId: string
  fromName: string
  toName: string
  amountCents: number
  declaredAt: string
}

type BalanceBody = {
  balances: Balance[]
  transfers: Transfer[]
  pendingSettlements: PendingSettlement[]
}

// Dépenses et soldes d'un événement. Les deux voyagent **ensemble** : une dépense saisie
// change un solde, et recharger l'un sans l'autre laisserait la moitié de l'écran périmée.
export function useExpenses(eventId: string) {
  const state = ref<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const expenses = ref<Expense[]>([])
  const balances = ref<Balance[]>([])
  const transfers = ref<Transfer[]>([])
  const pendingSettlements = ref<PendingSettlement[]>([])
  const error = ref('')

  async function reload(): Promise<void> {
    try {
      const [expenseBody, balanceBody] = await Promise.all([
        apiFetch<{ expenses: Expense[] }>(`/api/events/${eventId}/expenses`),
        apiFetch<BalanceBody>(`/api/events/${eventId}/balances`),
      ])

      expenses.value = expenseBody.expenses
      balances.value = balanceBody.balances
      transfers.value = balanceBody.transfers
      pendingSettlements.value = balanceBody.pendingSettlements
      // « Aucune dépense » n'est pas une erreur, et les soldes restent affichables : c'est
      // l'état de départ de tout événement.
      state.value = expenseBody.expenses.length === 0 ? 'empty' : 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      state.value = 'error'
    }
  }

  // Le mode par défaut reste `equal` : c'est le cas courant, et il ne demande rien de plus
  // que le libellé et le montant.
  async function record(input: RecordInput): Promise<void> {
    await apiFetch(`/api/events/${eventId}/expenses`, {
      method: 'POST',
      body: JSON.stringify({ splitMode: 'equal', ...input }),
    })
    await reload()
  }

  async function declare(toParticipantId: string, amountCents: number): Promise<void> {
    await apiFetch(`/api/events/${eventId}/settlements`, {
      method: 'POST',
      body: JSON.stringify({ toParticipantId, amountCents }),
    })
    await reload()
  }

  async function confirm(settlementId: string): Promise<void> {
    await apiFetch(`/api/settlements/${settlementId}/confirm`, { method: 'POST' })
    await reload()
  }

  async function withdraw(settlementId: string): Promise<void> {
    await apiFetch(`/api/settlements/${settlementId}`, { method: 'DELETE' })
    await reload()
  }

  onMounted(reload)

  return {
    state,
    expenses,
    balances,
    transfers,
    pendingSettlements,
    error,
    reload,
    record,
    declare,
    confirm,
    withdraw,
  }
}
