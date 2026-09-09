<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const route = useRoute()
const email = ref('')
const state = ref<'idle' | 'sending' | 'sent' | 'error'>('idle')
const message = ref('')

// La cible de reprise après connexion : le lien d'invitation qui a mené ici, sinon le
// tableau de bord. Le jeton d'invitation survit ainsi à l'aller-retour du courriel
// (conception §4).
const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'

// Un lien magique est à usage unique et vit quinze minutes. Sans ce message, un second clic
// ou un rechargement de la page d'arrivée rejetait ici en silence : l'utilisateur croyait
// avoir mal cliqué et n'avait aucun moyen de savoir qu'il devait en redemander un.
const authErrorLabel: Record<string, string> = {
  INVALID_TOKEN: 'Ce lien de connexion a expiré ou a déjà servi. Demandez-en un nouveau.',
  EXPIRED_TOKEN: 'Ce lien de connexion a expiré. Demandez-en un nouveau.',
}

const authError =
  typeof route.query.error === 'string'
    ? (authErrorLabel[route.query.error] ?? 'La connexion a échoué. Demandez un nouveau lien.')
    : ''

async function submit(): Promise<void> {
  state.value = 'sending'

  try {
    await session.requestMagicLink(email.value, redirect)
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

    <p
      v-if="authError && state === 'idle'"
      class="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {{ authError }}
    </p>

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
        class="rounded bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
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
