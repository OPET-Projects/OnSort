<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const email = ref('')
const state = ref<'idle' | 'sending' | 'sent' | 'error'>('idle')
const message = ref('')

async function submit(): Promise<void> {
  state.value = 'sending'

  try {
    await session.requestMagicLink(email.value)
    state.value = 'sent'
  } catch (error) {
    state.value = 'error'
    message.value = error instanceof Error ? error.message : 'Une erreur est survenue.'
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
    <h1 class="text-2xl font-semibold">On Sort ?</h1>

    <form v-if="state !== 'sent'" class="flex flex-col gap-3" @submit.prevent="submit">
      <label class="flex flex-col gap-1">
        <span class="text-sm">Adresse e-mail</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="rounded border border-neutral-300 px-3 py-2 text-base"
        />
      </label>

      <button
        type="submit"
        :disabled="state === 'sending'"
        class="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {{ state === 'sending' ? 'Envoi…' : 'Recevoir un lien de connexion' }}
      </button>

      <p v-if="state === 'error'" class="text-sm text-red-700">{{ message }}</p>
    </form>

    <p v-else class="text-sm">
      Si un compte existe pour cette adresse, un lien de connexion vient d'être envoyé.
      Il expire dans quinze minutes.
    </p>
  </main>
</template>
