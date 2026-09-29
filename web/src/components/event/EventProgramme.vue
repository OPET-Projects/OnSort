<script setup lang="ts">
import { ref } from 'vue'
import type {
  Activity,
  ActivityStatus,
  ProposeInput,
  VoteValue,
} from '../../composables/useActivities'
import { usePlaces } from '../../composables/usePlaces'
import ActivityCard from '../ActivityCard.vue'

const props = defineProps<{
  state: 'loading' | 'empty' | 'error' | 'ready'
  activities: Activity[]
  error: string
  hasAccepted: boolean
  isAdmin: boolean
  reload: () => Promise<void>
  propose: (input: ProposeInput) => Promise<void>
  vote: (activityId: string, value: VoteValue) => Promise<void>
  decide: (activityId: string, status: ActivityStatus) => Promise<void>
  move: (activityId: string, delta: -1 | 1) => Promise<void>
  cancel: (activityId: string, cancelled: boolean) => Promise<void>
}>()

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
    await props.propose({ title: proposal.value.title, address: proposal.value.address })
    proposal.value = { title: '', address: '' }
  } catch (cause) {
    proposalError.value = cause instanceof Error ? cause.message : 'La proposition a échoué.'
  }
}

// Réordonner et annuler n'ont pas de formulaire où poser leur erreur : une ligne au-dessus
// du programme évite un échec muet.
const actionError = ref('')

async function run(action: () => Promise<void>): Promise<void> {
  actionError.value = ''
  try {
    await action()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : "L'opération a échoué."
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <p v-if="state === 'loading'" class="text-sm text-muted">Chargement du programme…</p>

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

    <p
      v-else-if="state === 'empty'"
      class="rounded-card border border-dashed border-field p-6 text-center text-[13px] leading-relaxed text-muted"
    >
      Aucune activité proposée. Lancez le programme en proposant la première.
    </p>

    <div v-else class="flex flex-col gap-2.5">
      <p v-if="actionError" class="text-sm text-fail-ink">{{ actionError }}</p>
      <ActivityCard
        v-for="(activity, index) in activities"
        :key="activity.id"
        :activity="activity"
        :can-vote="hasAccepted"
        :is-admin="isAdmin"
        :is-first="index === 0"
        :is-last="index === activities.length - 1"
        @vote="vote"
        @decide="decide"
        @move="(activityId, delta) => run(() => move(activityId, delta))"
        @cancel="(activityId, cancelled) => run(() => cancel(activityId, cancelled))"
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
        aria-label="Nom de l'activité"
        type="text"
        required
        maxlength="200"
        placeholder="Musée, restaurant, balade…"
        class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
      />
      <div class="relative">
        <input
          v-model="proposal.address"
          aria-label="Adresse de l'activité, facultative"
          type="text"
          maxlength="500"
          autocomplete="off"
          placeholder="Où ? (facultatif)"
          class="h-12 w-full rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          @input="searchPlaces(proposal.address)"
        />

        <!--
          Les propositions viennent de la Base Adresse Nationale. Retenir le libellé normalisé
          plutôt que la frappe brute donne au géocodage la chaîne qu'il saura replacer.
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
</template>
