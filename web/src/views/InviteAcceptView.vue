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
    <p v-if="state === 'loading'" class="p-6 text-sm text-muted">Ouverture de l'invitation…</p>

    <div
      v-else-if="state === 'error'"
      class="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-5 py-10"
    >
      <h1 class="text-2xl font-bold tracking-tight">On sort&nbsp;?</h1>
      <p class="rounded-field border border-fail-line bg-fail px-4 py-3 text-sm text-fail-ink">
        {{ message }}
      </p>
      <RouterLink to="/" class="text-sm font-semibold text-accent">
        Retour au tableau de bord
      </RouterLink>
    </div>

    <template v-else-if="preview">
      <!--
        Aperçu de l'événement, rendu illisible tant que l'invité n'a pas tranché. Le flou est
        décoratif : le serveur n'a de toute façon envoyé que le strict nécessaire, jamais la
        liste des participants ni les dépenses. `aria-hidden` le retire des lecteurs d'écran,
        pour qui un décor flouté n'a aucun sens.
      -->
      <div class="pointer-events-none blur-[4px] select-none" aria-hidden="true">
        <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-7 md:px-8">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-2xl font-bold tracking-tight">{{ preview.title }}</h2>
            <span class="text-xs text-faint">Invitation</span>
          </div>
          <p v-if="preview.scope === 'event'" class="text-[13px] text-ink-2">
            {{ formatPeriod(preview.startsAt, preview.endsAt) }}
          </p>

          <div class="flex gap-4 border-b border-line pb-2.5 text-[13px] text-faint">
            <template v-if="preview.scope === 'event'">
              <span>Programme</span>
              <span>Participants</span>
              <span>Dépenses</span>
            </template>
            <template v-else>
              <span>Créneaux</span>
              <span>Membres</span>
            </template>
          </div>

          <div class="flex flex-col gap-2.5">
            <div
              v-for="line in 3"
              :key="line"
              class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4"
            >
              <div class="h-3.5 w-2/3 rounded-full bg-disabled"></div>
              <div class="h-2.5 w-1/3 rounded-full bg-line-soft"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="fixed inset-0 flex items-center justify-center bg-ink/28 p-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-title"
          class="flex w-full max-w-md flex-col gap-4 rounded-surface border border-line bg-surface p-5 shadow-float md:p-7"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-press"
            >
              {{ preview.organiser.slice(0, 2).toUpperCase() }}
            </span>
            <h1 id="invite-title" class="text-base leading-snug font-semibold">
              {{ preview.organiser }} vous invite{{ preview.scope === 'group' ? ' dans un groupe' : '' }}
            </h1>
          </div>

          <div class="flex flex-col gap-1">
            <p class="text-lg font-bold tracking-tight">{{ preview.title }}</p>
            <p v-if="preview.scope === 'event'" class="text-[13px] leading-relaxed text-ink-2">
              {{ formatPeriod(preview.startsAt, preview.endsAt) }}
            </p>
            <p class="text-[13px] text-muted">
              {{ preview.participantCount }}
              {{ preview.participantCount > 1 ? 'personnes y sont déjà' : 'personne y est déjà' }}
            </p>
          </div>

          <div class="flex flex-col gap-2">
            <button
              ref="joinButton"
              type="button"
              :disabled="state === 'joining'"
              class="flex h-13 items-center justify-center rounded-field bg-accent text-[15px] font-semibold text-white disabled:opacity-50"
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
              class="flex h-12 items-center justify-center rounded-field border border-field text-sm font-medium text-ink-2 disabled:opacity-50"
              @click="respond('invited')"
            >
              Je ne sais pas encore
            </button>
            <button
              type="button"
              :disabled="state === 'joining'"
              class="flex h-12 items-center justify-center rounded-field border border-field text-sm font-medium text-ink-2 disabled:opacity-50"
              @click="respond('declined')"
            >
              {{ preview.scope === 'group' ? 'Non merci' : 'Je ne peux pas' }}
            </button>
          </div>

          <p v-if="preview.scope === 'event'" class="text-xs leading-relaxed text-faint">
            Votre réponse n'est pas définitive : vous pourrez la changer depuis l'onglet
            Participants.
          </p>
        </div>
      </div>
    </template>
  </main>
</template>
