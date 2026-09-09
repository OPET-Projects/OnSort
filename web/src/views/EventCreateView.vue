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
  <main class="mx-auto max-w-md p-6 md:p-10">
    <h1 class="text-2xl font-semibold">Nouvel événement</h1>

    <form class="mt-6 flex flex-col gap-4" @submit.prevent="submit">
      <label class="flex flex-col gap-1">
        <span class="text-sm">Titre</span>
        <input
          v-model="title"
          type="text"
          required
          maxlength="200"
          class="rounded border border-neutral-300 px-3 py-2 text-base"
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm">Description (facultatif)</span>
        <textarea
          v-model="description"
          rows="3"
          class="rounded border border-neutral-300 px-3 py-2 text-base"
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm">Début</span>
        <input
          v-model="startsAt"
          type="datetime-local"
          required
          class="rounded border border-neutral-300 px-3 py-2 text-base"
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm">Fin</span>
        <input
          v-model="endsAt"
          type="datetime-local"
          required
          class="rounded border border-neutral-300 px-3 py-2 text-base"
        />
        <span v-if="periodError" class="text-sm text-red-700">{{ periodError }}</span>
      </label>

      <button
        type="submit"
        :disabled="state === 'sending'"
        class="rounded bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
      >
        {{ state === 'sending' ? 'Création…' : 'Créer l\'événement' }}
      </button>

      <p v-if="message" class="text-sm text-red-700">{{ message }}</p>
    </form>
  </main>
</template>
