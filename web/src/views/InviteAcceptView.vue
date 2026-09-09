<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useInvite } from '../composables/useInvite'
import { formatPeriod } from '../lib/dates'

const route = useRoute()
const router = useRouter()
const token = String(route.params.token)

const { state, preview, message, load, respond } = useInvite(token, {
  toLogin: () => {
    void router.replace({ name: 'login', query: { redirect: `/invite/${token}` } })
  },
  toEvent: (eventId) => {
    void router.replace(`/events/${eventId}`)
  },
  toGroup: (groupId) => {
    void router.replace(`/groups/${groupId}`)
  },
  toHome: () => {
    void router.replace({ name: 'home' })
  },
})

// Le bouton d'entrée reçoit le focus à l'ouverture : la popup est une décision, elle doit
// être atteignable au clavier sans traverser le décor qu'elle recouvre.
const joinButton = useTemplateRef<HTMLButtonElement>('joinButton')

onMounted(async () => {
  await load()
  joinButton.value?.focus()
})
</script>

<template>
  <main class="relative min-h-screen">
    <p v-if="state === 'loading'" class="p-6 text-sm text-neutral-500">
      Ouverture de l'invitation…
    </p>

    <div
      v-else-if="state === 'error'"
      class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6"
    >
      <h1 class="text-2xl font-semibold">On Sort ?</h1>
      <p class="text-sm text-red-700">{{ message }}</p>
      <RouterLink to="/" class="text-sm underline">Retour au tableau de bord</RouterLink>
    </div>

    <template v-else-if="preview">
      <!--
        Aperçu de l'événement, rendu illisible tant que l'invité n'a pas tranché. Le flou est
        décoratif : le serveur n'a de toute façon envoyé que le strict nécessaire, jamais la
        liste des participants ni les dépenses. `aria-hidden` le retire des lecteurs d'écran,
        pour qui un décor flouté n'a aucun sens.
      -->
      <div class="pointer-events-none select-none blur-sm" aria-hidden="true">
        <div class="mx-auto max-w-2xl p-6 md:p-10">
          <header>
            <div class="flex items-baseline justify-between gap-3">
              <h2 class="text-2xl font-semibold">{{ preview.title }}</h2>
              <span class="text-xs text-neutral-500">Invitation</span>
            </div>
            <p v-if="preview.scope === 'event'" class="mt-1 text-sm text-neutral-600">
              {{ formatPeriod(preview.startsAt, preview.endsAt) }}
            </p>
          </header>

          <nav class="mt-6 flex gap-4 border-b border-neutral-200 text-sm text-neutral-500">
            <template v-if="preview.scope === 'event'">
              <span class="pb-2">Programme</span>
              <span class="pb-2">Participants</span>
              <span class="pb-2">Dépenses</span>
            </template>
            <template v-else>
              <span class="pb-2">Créneaux</span>
              <span class="pb-2">Membres</span>
            </template>
          </nav>

          <div class="mt-6 flex flex-col gap-3">
            <div v-for="line in 3" :key="line" class="rounded border border-neutral-200 p-4">
              <div class="h-4 w-2/3 rounded bg-neutral-200"></div>
              <div class="mt-2 h-3 w-1/3 rounded bg-neutral-100"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="fixed inset-0 flex items-center justify-center bg-neutral-900/20 p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-title"
          class="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-lg"
        >
          <h1 id="invite-title" class="text-lg font-semibold">
            {{ preview.organiser }} vous invite{{ preview.scope === 'group' ? ' dans un groupe' : '' }}
          </h1>

          <p class="mt-3 text-sm">
            <strong>{{ preview.title }}</strong>
          </p>
          <p v-if="preview.scope === 'event'" class="mt-1 text-sm text-neutral-600">
            {{ formatPeriod(preview.startsAt, preview.endsAt) }}
          </p>
          <p class="mt-1 text-sm text-neutral-600">
            {{ preview.participantCount }}
            {{ preview.participantCount > 1 ? 'personnes y sont déjà' : 'personne y est déjà' }}
          </p>

          <div class="mt-6 flex flex-col gap-2">
            <button
              ref="joinButton"
              type="button"
              :disabled="state === 'joining'"
              class="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              @click="respond('accepted')"
            >
              {{
                state === 'joining'
                  ? 'Un instant…'
                  : preview.scope === 'group'
                    ? 'Rejoindre le groupe'
                    : 'Je participe'
              }}
            </button>
            <!--
              Un groupe n'a pas de RSVP : on en est membre ou non. « Je ne sais pas » n'aurait
              rien à enregistrer, et la proposer mentirait sur ce que le clic fait.
            -->
            <button
              v-if="preview.scope === 'event'"
              type="button"
              :disabled="state === 'joining'"
              class="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
              @click="respond('invited')"
            >
              Je ne sais pas encore
            </button>
            <button
              type="button"
              :disabled="state === 'joining'"
              class="rounded border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
              @click="respond('declined')"
            >
              {{ preview.scope === 'group' ? 'Non merci' : 'Je ne peux pas' }}
            </button>
          </div>

          <p v-if="preview.scope === 'event'" class="mt-4 text-xs text-neutral-500">
            Votre réponse n'est pas définitive : vous pourrez la changer depuis l'onglet
            Participants.
          </p>
        </div>
      </div>
    </template>
  </main>
</template>
