<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import ActivityCard from '../components/ActivityCard.vue'
import { useActivities } from '../composables/useActivities'
import { useEvent } from '../composables/useEvent'
import { useEventStream } from '../composables/useEventStream'
import { formatPeriod } from '../lib/dates'

const route = useRoute()
const id = String(route.params.id)
const { state, event, error, setRsvp, patch, createInviteLink, inviteByEmail } = useEvent(id)
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

const isAdmin = computed(() => event.value?.viewer.role === 'admin')
// Proposer et voter supposent d'avoir accepté l'événement (conception §3.8). L'interface
// applique la même règle que l'API, pour que le refus ne survienne pas après le clic.
const hasAccepted = computed(() => event.value?.viewer.rsvp === 'accepted')

// Le décompte est appliqué directement ; tout le reste provoque un rechargement ciblé
// (conception §6.4).
useEventStream(id, {
  onTally: applyTally,
  onChange: () => {
    void reloadProgramme()
  },
})

const tab = ref<'programme' | 'participants'>('programme')

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
async function reply(value: 'accepted' | 'declined'): Promise<void> {
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
async function copyLink(): Promise<void> {
  await navigator.clipboard.writeText(inviteUrl.value)
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
        <span class="pb-2 text-neutral-400">Dépenses · à venir</span>
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
