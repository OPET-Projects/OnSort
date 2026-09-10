<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ActivityCard from '../components/ActivityCard.vue'
import BalanceSheet from '../components/BalanceSheet.vue'
import ExpenseCard from '../components/ExpenseCard.vue'
import MapView from '../components/MapView.vue'
import { useActivities } from '../composables/useActivities'
import { useEvent } from '../composables/useEvent'
import { useEventStream } from '../composables/useEventStream'
import { useExpenses } from '../composables/useExpenses'
import { useMapConfig } from '../composables/useMapConfig'
import { usePlaces } from '../composables/usePlaces'
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

const { config: mapConfig, error: mapError } = useMapConfig()

// Seules les activités dont l'adresse a été reconnue portent un point. Les autres ne sont
// pas des erreurs : elles n'ont simplement pas de lieu à montrer.
const mapPoints = computed(() =>
  activities.value
    .filter((activity) => activity.lat !== null && activity.lng !== null)
    .map((activity, index) => ({
      id: activity.id,
      title: activity.title,
      lat: activity.lat as number,
      lng: activity.lng as number,
      position: index + 1,
    })),
)

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

const tab = ref<'programme' | 'participants' | 'depenses' | 'carte'>('programme')

const proposal = ref({ title: '', address: '' })
const proposalError = ref('')

// Autocomplétion de l'adresse. Choisir une proposition remplit le champ avec le libellé
// normalisé de la BAN, ce qui donne au géocodage côté serveur exactement la chaîne qu'il
// saura replacer.
const { suggestions, search: searchPlaces, clear: clearPlaces } = usePlaces()

function pickPlace(label: string): void {
  proposal.value.address = label
  clearPlaces()
}
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

// Les mêmes trois tons que sur le tableau de bord : un état se reconnaît à sa couleur d'un
// écran à l'autre.
const statusTone: Record<string, string> = {
  draft: 'bg-fill text-muted',
  active: 'bg-accent-soft text-accent',
  closed: 'bg-fill text-muted',
}
const rsvpTone: Record<string, string> = {
  invited: 'bg-wait text-wait-ink',
  accepted: 'bg-free text-free-ink',
  declined: 'bg-fail text-fail-ink',
}

// Le programme retenu, montré à part sur grand écran : c'est ce que l'organisateur regarde
// en dernier, une fois les votes tranchés.
const acceptedActivities = computed(() =>
  activities.value.filter((activity) => activity.status === 'accepted'),
)

const tabs = [
  { id: 'programme', label: 'Programme' },
  { id: 'participants', label: 'Participants' },
  { id: 'depenses', label: 'Dépenses' },
  { id: 'carte', label: 'Carte' },
] as const

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
    class="fixed inset-x-0 top-0 z-30 flex justify-center p-4"
  >
    <p
      class="flex items-center gap-2.5 rounded-field px-4 py-3 text-[13px] text-white shadow-float"
      :class="snackbar.tone === 'ok' ? 'bg-ink' : 'bg-fail-ink'"
    >
      {{ snackbar.text }}
    </p>
  </div>

  <main class="mx-auto w-full max-w-2xl md:max-w-5xl">
    <p v-if="state === 'loading'" class="px-5 py-7 text-sm text-muted">Chargement…</p>

    <div
      v-else-if="state === 'error'"
      class="m-5 rounded-card border border-fail-line bg-fail p-5 text-sm text-fail-ink"
    >
      {{ error }}
    </div>

    <template v-else-if="event">
      <header class="flex flex-col gap-4 border-b border-line bg-surface px-5 pt-4 md:px-8 md:pt-6">
        <div class="flex items-start justify-between gap-3">
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line"
            aria-label="Revenir aux sorties"
            @click="$router.back()"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14.5 5 8 12l6.5 7" />
            </svg>
          </button>

          <span
            class="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            :class="statusTone[event.status]"
          >
            {{ statusLabel[event.status] }}
          </span>
        </div>

        <div class="flex flex-col gap-1">
          <h1 class="text-2xl font-bold tracking-tight md:text-[26px]">{{ event.title }}</h1>
          <p class="text-[13px] text-ink-2">
            {{ formatPeriod(event.startsAt, event.endsAt) }}
          </p>
          <p v-if="event.description" class="mt-2 text-sm leading-relaxed whitespace-pre-line">
            {{ event.description }}
          </p>
        </div>

        <nav class="flex gap-1 md:gap-6">
          <button
            v-for="entry in tabs"
            :key="entry.id"
            type="button"
            class="flex-1 pb-3.5 text-[13px] md:flex-none md:text-sm"
            :class="
              tab === entry.id
                ? 'border-b-2 border-accent font-semibold text-ink'
                : 'border-b-2 border-transparent font-medium text-faint'
            "
            @click="tab = entry.id"
          >
            {{ entry.label }}
          </button>
        </nav>
      </header>

      <div class="px-5 py-6 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:gap-6 md:px-8">
        <div class="flex min-w-0 flex-col gap-4">
          <section v-if="tab === 'programme'" class="flex flex-col gap-4">
            <p v-if="programmeState === 'loading'" class="text-sm text-muted">
              Chargement du programme…
            </p>

            <div
              v-else-if="programmeState === 'error'"
              class="flex flex-col items-start gap-3 rounded-card border border-fail-line bg-fail p-5"
            >
              <p class="text-sm text-fail-ink">{{ programmeError }}</p>
              <button
                type="button"
                class="flex h-10 items-center rounded-control border border-fail-line bg-surface px-4 text-sm font-semibold text-fail-ink"
                @click="reloadProgramme()"
              >
                Réessayer
              </button>
            </div>

            <p
              v-else-if="programmeState === 'empty'"
              class="rounded-card border border-dashed border-field p-6 text-center text-[13px] leading-relaxed text-muted"
            >
              Aucune activité proposée. Lancez le programme en proposant la première.
            </p>

            <div v-else class="flex flex-col gap-2.5">
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
              class="flex flex-col gap-2.5 rounded-card border border-dashed border-field p-4"
              @submit.prevent="submitProposal"
            >
              <h2 class="text-sm font-semibold">Proposer une activité</h2>
              <input
                v-model="proposal.title"
                type="text"
                required
                maxlength="200"
                placeholder="Musée, restaurant, balade…"
                class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
              />
              <div class="relative">
                <input
                  v-model="proposal.address"
                  type="text"
                  maxlength="500"
                  autocomplete="off"
                  placeholder="Où ? (facultatif)"
                  class="h-12 w-full rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
                  @input="searchPlaces(proposal.address)"
                />

                <!--
                  Les propositions viennent de la Base Adresse Nationale. Retenir le libellé
                  normalisé plutôt que la frappe brute donne au géocodage la chaîne qu'il saura
                  replacer.
                -->
                <ul
                  v-if="suggestions.length > 0"
                  class="absolute z-10 mt-1 w-full overflow-hidden rounded-control border border-line bg-surface shadow-float"
                >
                  <li v-for="place in suggestions" :key="place.label">
                    <button
                      type="button"
                      class="block w-full px-3.5 py-3 text-left text-[13px] hover:bg-canvas"
                      @click="pickPlace(place.label)"
                    >
                      {{ place.label }}
                    </button>
                  </li>
                </ul>
              </div>
              <button
                type="submit"
                class="flex h-12 items-center justify-center rounded-control bg-ink text-sm font-semibold text-white"
              >
                Proposer
              </button>
              <p v-if="proposalError" class="text-sm text-fail-ink">{{ proposalError }}</p>
            </form>

            <p v-else class="rounded-field bg-fill p-3.5 text-[13px] leading-relaxed text-ink-2">
              Acceptez l'événement pour proposer une activité et voter.
            </p>
          </section>

          <section v-if="tab === 'depenses'" class="flex flex-col gap-4">
            <p v-if="expensesState === 'loading'" class="text-sm text-muted">
              Chargement des dépenses…
            </p>

            <div
              v-else-if="expensesState === 'error'"
              class="flex flex-col items-start gap-3 rounded-card border border-fail-line bg-fail p-5"
            >
              <p class="text-sm text-fail-ink">{{ expensesError }}</p>
              <button
                type="button"
                class="flex h-10 items-center rounded-control border border-fail-line bg-surface px-4 text-sm font-semibold text-fail-ink"
                @click="reloadExpenses()"
              >
                Réessayer
              </button>
            </div>

            <template v-else>
              <p
                v-if="expensesState === 'empty'"
                class="rounded-card border border-dashed border-field p-6 text-center text-[13px] leading-relaxed text-muted"
              >
                Aucune dépense pour l'instant. Saisissez la première pour que les comptes
                démarrent.
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
                  type="text"
                  required
                  maxlength="200"
                  placeholder="Restaurant, taxi, billets…"
                  class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
                />
                <input
                  v-model="spending.amount"
                  type="text"
                  inputmode="decimal"
                  required
                  placeholder="Montant en euros"
                  class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
                />
                <button
                  type="submit"
                  class="flex h-12 items-center justify-center rounded-control bg-accent text-sm font-semibold text-white"
                >
                  Enregistrer
                </button>
                <p class="text-xs leading-relaxed text-faint">
                  La dépense est partagée à parts égales entre ceux qui ont accepté
                  l'événement.
                </p>
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
                <p v-if="settlementError" class="mt-2 text-sm text-fail-ink">
                  {{ settlementError }}
                </p>
              </div>
            </template>
          </section>

          <section v-if="tab === 'carte'" class="flex flex-col gap-4">
            <p v-if="mapError" class="text-sm text-fail-ink">{{ mapError }}</p>

            <p
              v-else-if="mapPoints.length === 0"
              class="rounded-card border border-dashed border-field p-6 text-center text-[13px] leading-relaxed text-muted"
            >
              Aucune activité n'a d'adresse reconnue. Renseignez le champ « où ? » d'une
              activité dans l'onglet Programme, et elle apparaîtra ici.
            </p>

            <template v-else-if="mapConfig">
              <div class="overflow-hidden rounded-card border border-line">
                <MapView
                  :points="mapPoints"
                  :tiles-url="mapConfig.tilesUrl"
                  :attribution="mapConfig.attribution"
                />
              </div>

              <ol class="flex flex-col gap-2.5">
                <li
                  v-for="point in mapPoints"
                  :key="point.id"
                  class="flex items-center gap-3 text-sm"
                >
                  <span
                    class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white"
                  >
                    {{ point.position }}
                  </span>
                  <span class="font-medium">{{ point.title }}</span>
                </li>
              </ol>
            </template>
          </section>

          <section v-if="tab === 'participants'" class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <h2 class="text-[13px] font-semibold text-label">Votre réponse</h2>
              <div class="flex gap-1.5 rounded-field bg-fill p-1">
                <button
                  type="button"
                  :disabled="rsvpBusy"
                  class="h-11 flex-1 rounded-control text-[13px]"
                  :class="
                    event.viewer.rsvp === 'accepted'
                      ? 'bg-surface font-semibold shadow-rest'
                      : 'font-medium text-muted'
                  "
                  @click="reply('accepted')"
                >
                  Je participe
                </button>
                <button
                  type="button"
                  :disabled="rsvpBusy"
                  class="h-11 flex-1 rounded-control text-[13px]"
                  :class="
                    event.viewer.rsvp === 'invited'
                      ? 'bg-surface font-semibold shadow-rest'
                      : 'font-medium text-muted'
                  "
                  @click="reply('invited')"
                >
                  Je ne sais pas
                </button>
                <button
                  type="button"
                  :disabled="rsvpBusy"
                  class="h-11 flex-1 rounded-control text-[13px]"
                  :class="
                    event.viewer.rsvp === 'declined'
                      ? 'bg-surface font-semibold shadow-rest'
                      : 'font-medium text-muted'
                  "
                  @click="reply('declined')"
                >
                  Je ne peux pas
                </button>
              </div>
            </div>

            <ul class="flex flex-col rounded-card border border-line bg-surface">
              <li
                v-for="participant in event.participants"
                :key="participant.userId"
                class="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
              >
                <span
                  class="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-press"
                >
                  {{ participant.name.slice(0, 2).toUpperCase() }}
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="truncate text-sm font-medium">{{ participant.name }}</span>
                  <span v-if="participant.role === 'admin'" class="text-xs text-faint">
                    Organisateur
                  </span>
                </span>
                <span
                  class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
                  :class="rsvpTone[participant.rsvp]"
                >
                  {{ rsvpLabel[participant.rsvp] }}
                </span>
              </li>

              <!--
                Invitations nominatives sans réponse, visibles du seul organisateur. Elles
                répondent à « qui ai-je invité qui n'a rien dit ? ». Un lien partageable n'a pas
                de destinataire et n'en produit aucune.
              -->
              <li
                v-for="invitation in event.pendingInvitations"
                :key="invitation.id"
                class="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
              >
                <span class="h-8.5 w-8.5 shrink-0 rounded-full border border-dashed border-field"></span>
                <span class="min-w-0 flex-1 truncate text-sm text-faint italic">
                  {{ invitation.email }}
                </span>
                <span class="shrink-0 rounded-lg bg-wait px-2.5 py-1 text-xs font-semibold text-wait-ink">
                  Invitation envoyée
                </span>
              </li>
            </ul>

            <p
              v-if="isAdmin && event.pendingInvitations.length > 0"
              class="text-xs leading-relaxed text-faint"
            >
              Ces personnes ont reçu une invitation et n'ont pas encore répondu. Vous seul
              voyez cette liste.
            </p>

            <section v-if="isAdmin" class="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
              <h2 class="text-sm font-semibold">Inviter</h2>

              <form class="flex gap-2" @submit.prevent="sendEmailInvite">
                <label class="sr-only" for="invite-email">Inviter par e-mail</label>
                <input
                  id="invite-email"
                  v-model="inviteEmail"
                  type="email"
                  required
                  placeholder="adresse@exemple.fr"
                  class="h-12 min-w-0 flex-1 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
                />
                <button
                  type="submit"
                  class="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-accent text-white"
                  aria-label="Envoyer l'invitation"
                >
                  <svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 12h15M13.5 6.5 20 12l-6.5 5.5" />
                  </svg>
                </button>
              </form>

              <p v-if="inviteSent" class="text-xs leading-relaxed text-faint">
                Si un compte existe pour cette adresse, l'invitation lui a été transmise ;
                sinon un courriel d'invitation vient de partir.
              </p>

              <button
                type="button"
                class="flex h-12 items-center justify-center gap-2 rounded-control border border-field text-sm font-medium text-ink-2"
                @click="generateLink"
              >
                <svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
                  <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
                  <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" />
                </svg>
                Créer un lien partageable
              </button>

              <div v-if="inviteUrl" class="flex gap-2">
                <input
                  :value="inviteUrl"
                  readonly
                  class="h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 text-xs text-muted"
                />
                <button
                  type="button"
                  class="flex h-11 shrink-0 items-center rounded-control bg-ink px-3.5 text-xs font-semibold text-white"
                  @click="copyLink"
                >
                  Copier
                </button>
              </div>
            </section>

            <section
              v-if="isAdmin"
              class="flex flex-wrap items-end gap-2.5 rounded-card border border-line bg-surface p-4"
            >
              <label class="flex flex-1 flex-col gap-1.5">
                <span class="text-[13px] font-semibold text-label">Statut de l'événement</span>
                <select
                  id="status"
                  v-model="statusDraft"
                  class="h-11 rounded-control border border-field bg-surface px-3 text-[13px] font-medium outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
                >
                  <option value="">Changer…</option>
                  <option value="draft">Brouillon</option>
                  <option value="active">En cours</option>
                  <option value="closed">Clôturé</option>
                </select>
              </label>
              <button
                type="button"
                class="flex h-11 items-center rounded-control bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
                :disabled="statusDraft === ''"
                @click="changeStatus"
              >
                Appliquer
              </button>
            </section>
          </section>
        </div>

        <!--
          Colonne de rappel, sur grand écran seulement : sur téléphone elle répéterait mot
          pour mot l'onglet ouvert juste à côté.
        -->
        <aside class="hidden md:flex md:flex-col md:gap-3">
          <div class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4 shadow-rest">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold">Participants</h2>
              <span class="text-xs text-faint">{{ event.participants.length }}</span>
            </div>
            <ul class="flex flex-col gap-2.5">
              <li
                v-for="participant in event.participants"
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
            v-if="acceptedActivities.length > 0"
            class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4 shadow-rest"
          >
            <h2 class="text-sm font-semibold">Le programme retenu</h2>
            <ol class="flex flex-col gap-2.5">
              <li
                v-for="(activity, index) in acceptedActivities"
                :key="activity.id"
                class="flex items-center gap-2.5"
              >
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white"
                >
                  {{ index + 1 }}
                </span>
                <span class="min-w-0 flex-1 truncate text-[13px]">{{ activity.title }}</span>
              </li>
            </ol>
          </div>

          <p class="flex items-center gap-2.5 rounded-card border border-free-line bg-free px-4 py-3 text-xs leading-relaxed text-free-ink-strong">
            <span class="h-2 w-2 shrink-0 rounded-full bg-free-ink"></span>
            En direct · votes et dépenses arrivent sans rechargement.
          </p>
        </aside>
      </div>
    </template>
  </main>
</template>
