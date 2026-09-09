<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ActivityCard from '../components/ActivityCard.vue'
import BalanceSheet from '../components/BalanceSheet.vue'
import ExpenseCard from '../components/ExpenseCard.vue'
import { useActivities } from '../composables/useActivities'
import { useEvent } from '../composables/useEvent'
import { useEventStream } from '../composables/useEventStream'
import { useExpenses } from '../composables/useExpenses'
import { copyToClipboard } from '../lib/clipboard'
import { formatPeriod } from '../lib/dates'
import { formatCents, parseEurosToCents } from '../lib/money'

const route = useRoute()
const id = String(route.params.id)
const { state, event, error, refresh, setRsvp, patch, createInviteLink, inviteByEmail } =
  useEvent(id)
// Destructuré comme `useEvent` ci-dessus : laissé sous forme d'objet, `programme.state`
// serait une `Ref` dans le gabarit, et `programme.state === 'ready'` serait silencieusement
// toujours faux.
const {
  state: programmeState,
  activities,
  error: programmeError,
  reload: reloadProgramme,
  applyTally,
  propose,
  vote,
  decide,
} = useActivities(id)

// Même remarque que ci-dessus sur la destructuration : les `Ref` doivent rester nommées.
const {
  state: expensesState,
  expenses,
  balances,
  transfers,
  pendingSettlements,
  error: expensesError,
  reload: reloadExpenses,
  record,
  declare,
  confirm,
  withdraw,
} = useExpenses(id)

const viewerId = computed(() => event.value?.viewer.participantId ?? '')
const isAdmin = computed(() => event.value?.viewer.role === 'admin')
// Proposer et voter supposent d'avoir accepté l'événement (conception §3.8). L'interface
// applique la même règle que l'API, pour que le refus ne survienne pas après le clic.
const hasAccepted = computed(() => event.value?.viewer.rsvp === 'accepted')

// Le décompte est appliqué directement ; tout le reste provoque un rechargement ciblé
// (conception §6.4).
useEventStream(id, {
  onTally: applyTally,
  onActivityChange: () => {
    void reloadProgramme()
  },
  onParticipantChange: () => {
    void refresh()
  },
  // Dépenses et règlements rechargent la même moitié d'écran : un virement confirmé sur un
  // téléphone efface la dette sur l'écran d'en face, sans rechargement.
  onExpenseChange: () => {
    void reloadExpenses()
  },
})

const tab = ref<'programme' | 'participants' | 'depenses'>('programme')

const proposal = ref({ title: '', address: '' })
const proposalError = ref('')
async function submitProposal(): Promise<void> {
  proposalError.value = ''
  try {
    await propose({ title: proposal.value.title, address: proposal.value.address })
    proposal.value = { title: '', address: '' }
  } catch (cause) {
    proposalError.value = cause instanceof Error ? cause.message : 'La proposition a échoué.'
  }
}

const spending = ref({ label: '', amount: '' })
const spendingError = ref('')
async function submitExpense(): Promise<void> {
  spendingError.value = ''
  const amountCents = parseEurosToCents(spending.value.amount)

  // Le montant est refusé ici, avec le contexte du formulaire, plutôt que dans
  // `parseEurosToCents` qui n'aurait pas de quoi rédiger le message.
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    spendingError.value = 'Saisissez un montant en euros, supérieur à zéro.'
    return
  }

  try {
    await record({ label: spending.value.label, amountCents })
    spending.value = { label: '', amount: '' }
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

const statusLabel: Record<string, string> = {
  draft: 'Brouillon',
  active: 'En cours',
  closed: 'Clôturé',
}
const rsvpLabel: Record<string, string> = {
  invited: 'À confirmer',
  accepted: 'Participe',
  declined: 'Décline',
}

const rsvpBusy = ref(false)
async function reply(value: 'accepted' | 'invited' | 'declined'): Promise<void> {
  rsvpBusy.value = true
  try {
    await setRsvp(value)
  } finally {
    rsvpBusy.value = false
  }
}

const statusDraft = ref('')
async function changeStatus(): Promise<void> {
  if (statusDraft.value === '') return
  await patch({ status: statusDraft.value as 'draft' | 'active' | 'closed' })
  statusDraft.value = ''
}

const inviteUrl = ref('')
async function generateLink(): Promise<void> {
  inviteUrl.value = await createInviteLink()
}
// Bandeau de confirmation, en haut de l'écran. Sans lui, copier un lien ne produit aucun
// retour visible : le geste réussit ou échoue dans le même silence.
const snackbar = ref<{ tone: 'ok' | 'error'; text: string } | null>(null)
let snackbarTimer: ReturnType<typeof setTimeout> | undefined

function notify(tone: 'ok' | 'error', text: string): void {
  snackbar.value = { tone, text }
  clearTimeout(snackbarTimer)
  snackbarTimer = setTimeout(() => {
    snackbar.value = null
  }, 3000)
}

// Le compteur est annulé au démontage : sans cela, une navigation juste après une copie
// écrirait dans une `ref` dont le composant n'existe plus.
onUnmounted(() => clearTimeout(snackbarTimer))

async function copyLink(): Promise<void> {
  const copied = await copyToClipboard(inviteUrl.value)

  if (copied) {
    notify('ok', 'Lien copié dans le presse-papiers.')
  } else {
    notify('error', 'La copie a échoué. Sélectionnez le lien et copiez-le à la main.')
  }
}

const inviteEmail = ref('')
const inviteSent = ref(false)
async function sendEmailInvite(): Promise<void> {
  await inviteByEmail(inviteEmail.value)
  inviteEmail.value = ''
  inviteSent.value = true
}
</script>

<template>
  <!--
    `role="status"` et `aria-live="polite"` : le message est annoncé sans interrompre ce que
    l'utilisateur est en train de faire. `aria-hidden` sur le conteneur vide éviterait
    l'annonce d'un bandeau absent, mais Vue le retire du DOM, ce qui suffit.
  -->
  <div
    v-if="snackbar"
    role="status"
    aria-live="polite"
    class="fixed inset-x-0 top-0 z-10 flex justify-center p-4"
  >
    <p
      class="rounded px-4 py-2 text-sm shadow-lg"
      :class="
        snackbar.tone === 'ok' ? 'bg-neutral-900 text-white' : 'bg-red-700 text-white'
      "
    >
      {{ snackbar.text }}
    </p>
  </div>

  <main class="mx-auto max-w-2xl p-6 md:p-10">
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Chargement…</p>

    <p v-else-if="state === 'error'" class="text-sm text-red-700">{{ error }}</p>

    <template v-else-if="event">
      <header>
        <div class="flex items-baseline justify-between gap-3">
          <h1 class="text-2xl font-semibold">{{ event.title }}</h1>
          <span class="text-xs text-neutral-500">{{ statusLabel[event.status] }}</span>
        </div>
        <p class="mt-1 text-sm text-neutral-600">
          {{ formatPeriod(event.startsAt, event.endsAt) }}
        </p>
        <p v-if="event.description" class="mt-3 whitespace-pre-line text-sm">
          {{ event.description }}
        </p>
      </header>

      <nav class="mt-6 flex gap-4 border-b border-neutral-200 text-sm">
        <button
          type="button"
          class="pb-2"
          :class="
            tab === 'programme' ? 'border-b-2 border-neutral-900 font-medium' : 'text-neutral-500'
          "
          @click="tab = 'programme'"
        >
          Programme
        </button>
        <button
          type="button"
          class="pb-2"
          :class="
            tab === 'participants'
              ? 'border-b-2 border-neutral-900 font-medium'
              : 'text-neutral-500'
          "
          @click="tab = 'participants'"
        >
          Participants
        </button>
        <button
          type="button"
          class="pb-2"
          :class="
            tab === 'depenses' ? 'border-b-2 border-neutral-900 font-medium' : 'text-neutral-500'
          "
          @click="tab = 'depenses'"
        >
          Dépenses
        </button>
      </nav>

      <section v-if="tab === 'programme'" class="mt-6">
        <p v-if="programmeState === 'loading'" class="text-sm text-neutral-500">
          Chargement du programme…
        </p>

        <div v-else-if="programmeState === 'error'" class="text-sm text-red-700">
          <p>{{ programmeError }}</p>
          <button type="button" class="mt-2 underline" @click="reloadProgramme()">
            Réessayer
          </button>
        </div>

        <p v-else-if="programmeState === 'empty'" class="text-sm text-neutral-600">
          Aucune activité proposée. Lancez le programme en proposant la première.
        </p>

        <div v-else class="flex flex-col gap-3">
          <ActivityCard
            v-for="activity in activities"
            :key="activity.id"
            :activity="activity"
            :can-vote="hasAccepted"
            :is-admin="isAdmin"
            @vote="vote"
            @decide="decide"
          />
        </div>

        <form
          v-if="hasAccepted"
          class="mt-6 flex flex-col gap-2 border-t border-neutral-100 pt-4"
          @submit.prevent="submitProposal"
        >
          <h2 class="text-sm font-medium">Proposer une activité</h2>
          <input
            v-model="proposal.title"
            type="text"
            required
            maxlength="200"
            placeholder="Musée, restaurant, balade…"
            class="rounded border border-neutral-300 px-3 py-2 text-base"
          />
          <input
            v-model="proposal.address"
            type="text"
            maxlength="500"
            placeholder="Où ? (facultatif)"
            class="rounded border border-neutral-300 px-3 py-2 text-base"
          />
          <button type="submit" class="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
            Proposer
          </button>
          <p v-if="proposalError" class="text-sm text-red-700">{{ proposalError }}</p>
        </form>

        <p v-else class="mt-6 border-t border-neutral-100 pt-4 text-sm text-neutral-500">
          Acceptez l'événement pour proposer une activité et voter.
        </p>
      </section>

      <section v-if="tab === 'depenses'" class="mt-6">
        <p v-if="expensesState === 'loading'" class="text-sm text-neutral-500">
          Chargement des dépenses…
        </p>

        <div v-else-if="expensesState === 'error'" class="text-sm text-red-700">
          <p>{{ expensesError }}</p>
          <button type="button" class="mt-2 underline" @click="reloadExpenses()">Réessayer</button>
        </div>

        <template v-else>
          <p v-if="expensesState === 'empty'" class="text-sm text-neutral-600">
            Aucune dépense pour l'instant. Saisissez la première pour que les comptes démarrent.
          </p>

          <div v-else class="flex flex-col gap-3">
            <ExpenseCard
              v-for="expense in expenses"
              :key="expense.id"
              :expense="expense"
              :viewer-id="viewerId"
            />
          </div>

          <form
            v-if="hasAccepted"
            class="mt-6 flex flex-col gap-2 border-t border-neutral-100 pt-4"
            @submit.prevent="submitExpense"
          >
            <h2 class="text-sm font-medium">Saisir une dépense</h2>
            <input
              v-model="spending.label"
              type="text"
              required
              maxlength="200"
              placeholder="Restaurant, taxi, billets…"
              class="rounded border border-neutral-300 px-3 py-2 text-base"
            />
            <input
              v-model="spending.amount"
              type="text"
              inputmode="decimal"
              required
              placeholder="Montant en euros"
              class="rounded border border-neutral-300 px-3 py-2 text-base"
            />
            <button type="submit" class="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
              Enregistrer
            </button>
            <p class="text-xs text-neutral-500">
              La dépense est partagée à parts égales entre ceux qui ont accepté l'événement.
            </p>
            <p v-if="spendingError" class="text-sm text-red-700">{{ spendingError }}</p>
          </form>

          <p v-else class="mt-6 border-t border-neutral-100 pt-4 text-sm text-neutral-500">
            Acceptez l'événement pour saisir une dépense.
          </p>

          <div class="mt-8 border-t border-neutral-100 pt-6">
            <BalanceSheet
              :balances="balances"
              :transfers="transfers"
              :pending-settlements="pendingSettlements"
              :viewer-id="viewerId"
              @declare="(to, amount) => runSettlement(() => declare(to, amount))"
              @confirm="(settlementId) => runSettlement(() => confirm(settlementId))"
              @withdraw="(settlementId) => runSettlement(() => withdraw(settlementId))"
            />
            <p v-if="settlementError" class="mt-2 text-sm text-red-700">{{ settlementError }}</p>
          </div>
        </template>
      </section>

      <section v-if="tab === 'participants'" class="mt-6">
        <div class="flex items-center gap-2">
          <span class="text-sm">Votre réponse :</span>
          <button
            type="button"
            :disabled="rsvpBusy"
            class="rounded px-3 py-1 text-sm"
            :class="
              event.viewer.rsvp === 'accepted'
                ? 'bg-neutral-900 text-white'
                : 'border border-neutral-300'
            "
            @click="reply('accepted')"
          >
            Je participe
          </button>
          <button
            type="button"
            :disabled="rsvpBusy"
            class="rounded px-3 py-1 text-sm"
            :class="
              event.viewer.rsvp === 'invited'
                ? 'bg-neutral-900 text-white'
                : 'border border-neutral-300'
            "
            @click="reply('invited')"
          >
            Je ne sais pas
          </button>
          <button
            type="button"
            :disabled="rsvpBusy"
            class="rounded px-3 py-1 text-sm"
            :class="
              event.viewer.rsvp === 'declined'
                ? 'bg-neutral-900 text-white'
                : 'border border-neutral-300'
            "
            @click="reply('declined')"
          >
            Je ne peux pas
          </button>
        </div>

        <ul class="mt-4 divide-y divide-neutral-100">
          <li
            v-for="participant in event.participants"
            :key="participant.userId"
            class="flex items-center justify-between py-2"
          >
            <span>
              {{ participant.name }}
              <span v-if="participant.role === 'admin'" class="ml-1 text-xs text-neutral-500">
                (admin)
              </span>
            </span>
            <span class="text-xs text-neutral-500">{{ rsvpLabel[participant.rsvp] }}</span>
          </li>
        </ul>
      </section>

      <section v-if="isAdmin" class="mt-8 rounded border border-neutral-200 p-4">
        <h2 class="text-sm font-medium">Administration</h2>
        <div class="mt-3 flex items-center gap-2">
          <label class="text-sm" for="status">Statut</label>
          <select id="status" v-model="statusDraft" class="rounded border border-neutral-300 px-2 py-1 text-sm">
            <option value="">Changer…</option>
            <option value="draft">Brouillon</option>
            <option value="active">En cours</option>
            <option value="closed">Clôturé</option>
          </select>
          <button
            type="button"
            class="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            :disabled="statusDraft === ''"
            @click="changeStatus"
          >
            Appliquer
          </button>
        </div>

        <div class="mt-5 border-t border-neutral-100 pt-4">
          <h3 class="text-sm font-medium">Inviter</h3>

          <div class="mt-2">
            <button
              type="button"
              class="rounded border border-neutral-300 px-3 py-1 text-sm"
              @click="generateLink"
            >
              Créer un lien partageable
            </button>
            <div v-if="inviteUrl" class="mt-2 flex items-center gap-2">
              <input
                :value="inviteUrl"
                readonly
                class="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-xs"
              />
              <button
                type="button"
                class="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                @click="copyLink"
              >
                Copier
              </button>
            </div>
          </div>

          <form class="mt-4 flex flex-col gap-2" @submit.prevent="sendEmailInvite">
            <label class="text-sm" for="invite-email">Inviter par e-mail</label>
            <div class="flex gap-2">
              <input
                id="invite-email"
                v-model="inviteEmail"
                type="email"
                required
                class="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <button type="submit" class="rounded bg-neutral-900 px-3 py-1 text-sm text-white">
                Envoyer
              </button>
            </div>
            <p v-if="inviteSent" class="text-xs text-neutral-500">
              Si un compte existe pour cette adresse, l'invitation lui a été transmise ;
              sinon un courriel d'invitation vient de partir.
            </p>
          </form>
        </div>
      </section>
    </template>
  </main>
</template>
