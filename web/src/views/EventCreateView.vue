<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { localInputToIso } from '../lib/dates'
import { ApiFetchError, apiFetch } from '../lib/http'

const router = useRouter()

const title = ref('')
const description = ref('')
const startsAt = ref('')
const endsAt = ref('')
const state = ref<'idle' | 'sending' | 'error'>('idle')
const message = ref('')
const periodError = ref('')

async function submit(): Promise<void> {
  state.value = 'sending'
  message.value = ''
  periodError.value = ''

  try {
    const { id } = await apiFetch<{ id: string }>('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        title: title.value,
        description: description.value,
        startsAt: localInputToIso(startsAt.value),
        endsAt: localInputToIso(endsAt.value),
      }),
    })
    await router.push(`/events/${id}`)
  } catch (cause) {
    state.value = 'error'
    if (cause instanceof ApiFetchError && cause.code === 'invalid_period') {
      periodError.value = 'La fin doit être postérieure au début.'
      return
    }
    message.value = cause instanceof Error ? cause.message : 'La création a échoué.'
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-md">
    <header class="flex items-center gap-3 border-b border-line bg-surface px-5 py-4">
      <button
        type="button"
        class="flex h-11 w-11 items-center justify-center rounded-control border border-line"
        aria-label="Revenir en arrière"
        @click="$router.back()"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14.5 5 8 12l6.5 7" />
        </svg>
      </button>
      <h1 class="text-lg font-bold tracking-tight">Nouvelle sortie</h1>
    </header>

    <form class="flex flex-col gap-4.5 px-5 py-6" @submit.prevent="submit">
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-label">Titre</span>
        <input
          v-model="title"
          type="text"
          required
          maxlength="200"
          placeholder="Raclette chez Paul"
          class="h-13 rounded-field border border-field bg-surface px-3.5 text-[15px] shadow-rest outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="flex items-baseline justify-between">
          <span class="text-[13px] font-semibold text-label">Description</span>
          <span class="text-xs text-faint">facultatif</span>
        </span>
        <textarea
          v-model="description"
          rows="3"
          class="rounded-field border border-field bg-surface p-3.5 text-[15px] leading-relaxed shadow-rest outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
      </label>

      <div class="flex flex-col gap-4.5 sm:flex-row sm:gap-3">
        <label class="flex flex-1 flex-col gap-1.5">
          <span class="text-[13px] font-semibold text-label">Début</span>
          <input
            v-model="startsAt"
            type="datetime-local"
            required
            class="h-13 rounded-field border border-field bg-surface px-3.5 text-[15px] shadow-rest outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          />
        </label>

        <label class="flex flex-1 flex-col gap-1.5">
          <span class="text-[13px] font-semibold text-label">Fin</span>
          <input
            v-model="endsAt"
            type="datetime-local"
            required
            class="h-13 rounded-field border border-field bg-surface px-3.5 text-[15px] shadow-rest outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          />
        </label>
      </div>

      <p v-if="periodError" class="text-sm text-fail-ink">{{ periodError }}</p>

      <p class="flex gap-2.5 rounded-field bg-accent-soft p-3.5 text-[13px] leading-relaxed text-accent-press">
        <svg viewBox="0 0 24 24" class="mt-0.5 h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11.5v5M12 8.2v.2" />
        </svg>
        La fin n'est pas comprise dans la période : une sortie qui se termine à 23:30 libère
        le créneau à 23:30 pile.
      </p>

      <button
        type="submit"
        :disabled="state === 'sending'"
        class="flex h-13 items-center justify-center rounded-field bg-accent text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {{ state === 'sending' ? 'Création…' : 'Créer l\'événement' }}
      </button>

      <p class="text-center text-xs text-faint">
        Vous pourrez inviter et fixer le programme à l'étape suivante.
      </p>

      <p v-if="message" class="text-sm text-fail-ink">{{ message }}</p>
    </form>
  </main>
</template>
