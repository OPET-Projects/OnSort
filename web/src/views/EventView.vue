<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import EventExpenses from '../components/event/EventExpenses.vue'
import EventMap from '../components/event/EventMap.vue'
import EventParticipants from '../components/event/EventParticipants.vue'
import EventProgramme from '../components/event/EventProgramme.vue'
import EventSummary from '../components/event/EventSummary.vue'
import { useActivities } from '../composables/useActivities'
import { useEvent } from '../composables/useEvent'
import { useEventStream } from '../composables/useEventStream'
import { useExpenses } from '../composables/useExpenses'
import { useMapConfig } from '../composables/useMapConfig'
import { formatPeriod } from '../lib/dates'
import { statusLabel, statusTone } from '../lib/event-labels'

// La vue possède les données et le flux temps réel ; chaque onglet est un composant qui
// reçoit ce qu'il affiche et les gestes qu'il déclenche.

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
  move,
  cancel,
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

// Chargée avec la vue, pas avec l'onglet : ouvrir la carte deux fois ne la redemande pas.
const { config: mapConfig, error: mapError } = useMapConfig()

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

const tabs = [
  { id: 'programme', label: 'Programme' },
  { id: 'participants', label: 'Participants' },
  { id: 'depenses', label: 'Dépenses' },
  { id: 'carte', label: 'Carte' },
] as const

// Bandeau de confirmation, en haut de l'écran. Il vit ici et non dans un onglet : changer
// d'onglet juste après une copie ne doit pas l'effacer avant qu'on l'ait lu.
const snackbar = ref<{ tone: 'ok' | 'error'; text: string } | null>(null)
let snackbarTimer: ReturnType<typeof setTimeout> | undefined

function announce(tone: 'ok' | 'error', text: string): void {
  snackbar.value = { tone, text }
  clearTimeout(snackbarTimer)
  snackbarTimer = setTimeout(() => {
    snackbar.value = null
  }, 3000)
}

// Le compteur est annulé au démontage : sans cela, une navigation juste après une copie
// écrirait dans une `ref` dont le composant n'existe plus.
onUnmounted(() => clearTimeout(snackbarTimer))
</script>

<template>
  <!--
    `role="status"` et `aria-live="polite"` : le message est annoncé sans interrompre ce que
    l'utilisateur est en train de faire. Vue retire le bandeau du DOM quand il est vide.
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

  <main class="mx-auto w-full max-w-2xl md:max-w-5xl lg:max-w-6xl">
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
          <RouterLink
            v-if="event.group?.viewerIsMember"
            :to="`/groups/${event.group.id}`"
            class="self-start text-[13px] font-semibold text-accent"
          >
            Groupe {{ event.group.name }}
          </RouterLink>
          <p v-else-if="event.group" class="text-[13px] text-muted">
            Groupe {{ event.group.name }}
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
          <EventProgramme
            v-if="tab === 'programme'"
            :state="programmeState"
            :activities="activities"
            :error="programmeError"
            :has-accepted="hasAccepted"
            :is-admin="isAdmin"
            :reload="reloadProgramme"
            :propose="propose"
            :vote="vote"
            :decide="decide"
            :move="move"
            :cancel="cancel"
          />

          <EventExpenses
            v-if="tab === 'depenses'"
            :state="expensesState"
            :expenses="expenses"
            :balances="balances"
            :transfers="transfers"
            :pending-settlements="pendingSettlements"
            :error="expensesError"
            :participants="event.participants"
            :viewer-id="viewerId"
            :has-accepted="hasAccepted"
            :reload="reloadExpenses"
            :record="record"
            :declare="declare"
            :confirm="confirm"
            :withdraw="withdraw"
          />

          <EventMap
            v-if="tab === 'carte'"
            :activities="activities"
            :config="mapConfig"
            :error="mapError"
          />

          <EventParticipants
            v-if="tab === 'participants'"
            :event="event"
            :is-admin="isAdmin"
            :set-rsvp="setRsvp"
            :patch="patch"
            :create-invite-link="createInviteLink"
            :invite-by-email="inviteByEmail"
            @announce="announce"
          />
        </div>

        <EventSummary :participants="event.participants" :activities="activities" />
      </div>
    </template>
  </main>
</template>
