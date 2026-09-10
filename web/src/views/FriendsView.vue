<script setup lang="ts">
import { ref } from 'vue'
import { useFriends } from '../composables/useFriends'

const { state, friends, received, sent, error, requestSent, reload, ask, accept, decline } =
  useFriends()

const email = ref('')
const formError = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  formError.value = ''
  busy.value = true

  try {
    await ask(email.value)
    email.value = ''
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : "L'envoi a échoué."
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl px-5 py-7 md:px-8 md:py-9">
    <header class="flex flex-col gap-1.5">
      <h1 class="text-[26px] font-bold tracking-tight">Mes amis</h1>
      <p class="text-[13px] leading-relaxed text-muted">
        Vos amis n'ont accès à rien de plus : la liste sert à retrouver quelqu'un pour
        l'inviter, pas à partager vos sorties.
      </p>
    </header>

    <p v-if="state === 'loading'" class="mt-6 text-sm text-muted">Chargement…</p>

    <div
      v-else-if="state === 'error'"
      class="mt-6 flex flex-col items-start gap-3 rounded-card border border-fail-line bg-fail p-5"
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

    <template v-else>
      <section v-if="received.length > 0" class="mt-6 flex flex-col gap-2">
        <h2 class="text-[13px] font-semibold text-label">Demandes reçues</h2>
        <ul class="flex flex-col gap-2">
          <li
            v-for="request in received"
            :key="request.id"
            class="flex flex-wrap items-center gap-3 rounded-field border border-accent/30 bg-surface p-3.5 shadow-rest"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-press"
            >
              {{ request.from.name.slice(0, 2).toUpperCase() }}
            </span>
            <span class="min-w-0 flex-1 text-sm">{{ request.from.name }} veut vous ajouter en ami.</span>
            <span class="flex gap-2">
              <button
                type="button"
                class="flex h-11 items-center rounded-control bg-accent px-3.5 text-[13px] font-semibold text-white"
                @click="accept(request.id)"
              >
                Accepter
              </button>
              <button
                type="button"
                class="flex h-11 w-11 items-center justify-center rounded-control border border-field text-muted"
                :aria-label="`Refuser la demande de ${request.from.name}`"
                @click="decline(request.id)"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
                </svg>
              </button>
            </span>
          </li>
        </ul>
      </section>

      <section class="mt-6 flex flex-col gap-2">
        <h2 class="text-[13px] font-semibold text-label">Amis</h2>

        <p
          v-if="friends.length === 0"
          class="rounded-card border border-dashed border-field p-6 text-center text-[13px] leading-relaxed text-muted"
        >
          Aucun ami pour l'instant. Ajoutez quelqu'un par son adresse ci-dessous.
        </p>

        <ul v-else class="flex flex-col rounded-card border border-line bg-surface">
          <li
            v-for="friend in friends"
            :key="friend.userId"
            class="flex items-center gap-3 border-b border-line-soft p-3.5 last:border-b-0"
          >
            <span
              class="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-press"
            >
              {{ friend.name.slice(0, 2).toUpperCase() }}
            </span>
            <span class="text-sm font-medium">{{ friend.name }}</span>
          </li>
        </ul>
      </section>

      <section v-if="sent.length > 0" class="mt-6 flex flex-col gap-2">
        <h2 class="text-[13px] font-semibold text-label">Demandes envoyées</h2>
        <ul class="flex flex-col gap-2">
          <li
            v-for="request in sent"
            :key="request.id"
            class="flex items-center justify-between gap-3 rounded-field bg-fill px-4 py-3 text-sm text-ink-2"
          >
            <span>{{ request.to.name }}</span>
            <span class="text-xs text-faint">En attente</span>
          </li>
        </ul>
      </section>

      <form class="mt-8 flex flex-col gap-2.5" @submit.prevent="submit">
        <h2 class="text-[13px] font-semibold text-label">Ajouter un ami</h2>
        <div class="flex gap-2">
          <input
            v-model="email"
            type="email"
            required
            placeholder="adresse@exemple.fr"
            class="h-12 min-w-0 flex-1 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          />
          <button
            type="submit"
            :disabled="busy"
            class="flex h-12 shrink-0 items-center rounded-control bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>

        <!--
          La réponse de l'API est identique que le compte existe ou non (conception §4) :
          l'interface ne peut donc rien affirmer de plus que ceci.
        -->
        <p v-if="requestSent" class="text-xs leading-relaxed text-faint">
          Si un compte existe pour cette adresse, la demande lui a été transmise ; sinon une
          invitation vient de partir.
        </p>
        <p v-if="formError" class="text-sm text-fail-ink">{{ formError }}</p>
      </form>
    </template>
  </main>
</template>
