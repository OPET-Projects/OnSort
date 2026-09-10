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
  <main class="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-7 px-5 py-10">
    <div class="flex flex-col gap-2.5">
      <span class="flex h-12 w-12 items-center justify-center rounded-card bg-accent">
        <svg viewBox="0 0 24 24" class="h-6.5 w-6.5" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20s6.5-4.7 6.5-9.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.3 12 20 12 20Z" />
          <circle cx="12" cy="10.4" r="2.2" />
        </svg>
      </span>
      <h1 class="text-3xl font-bold tracking-tight md:text-4xl">On sort&nbsp;?</h1>
      <p class="text-[15px] leading-relaxed text-ink-2">
        Une date, un programme, les comptes à zéro. Pour les sorties à plusieurs.
      </p>
    </div>

    <p
      v-if="authError && state === 'idle'"
      class="rounded-field border border-wait-line bg-wait px-4 py-3 text-sm text-wait-ink"
    >
      {{ authError }}
    </p>

    <form
      v-if="state !== 'sent'"
      class="flex flex-col gap-3.5 md:rounded-surface md:border md:border-line md:bg-surface md:p-7 md:shadow-rest"
      @submit.prevent="submit"
    >
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-label">Adresse e-mail</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="h-13 rounded-field border border-field bg-surface px-3.5 text-[15px] shadow-rest outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
      </label>

      <button
        type="submit"
        :disabled="state === 'sending'"
        class="flex h-13 items-center justify-center rounded-field bg-accent text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {{ state === 'sending' ? 'Envoi…' : 'Recevoir un lien de connexion' }}
      </button>

      <p class="text-[13px] leading-relaxed text-muted">
        Pas de mot de passe. Le lien reçu ouvre votre session et expire au bout de quinze
        minutes.
      </p>

      <p v-if="state === 'error'" class="text-sm text-fail-ink">{{ message }}</p>
    </form>

    <div
      v-else
      class="flex flex-col gap-3.5 rounded-surface border border-line bg-surface p-5 shadow-rest"
    >
      <span class="flex h-10 w-10 items-center justify-center rounded-control bg-accent-soft">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" class="text-accent" />
          <path d="m3.8 7 8.2 6 8.2-6" class="text-accent" />
        </svg>
      </span>
      <h2 class="text-[17px] font-semibold">Vérifiez votre boîte mail</h2>
      <p class="text-sm leading-relaxed text-ink-2">
        Si un compte existe pour cette adresse, un lien de connexion vient d'être envoyé.
        Il expire dans quinze minutes.
      </p>
      <button
        type="button"
        class="self-start text-sm font-semibold text-accent"
        @click="state = 'idle'"
      >
        Saisir une autre adresse
      </button>
    </div>

    <p class="text-xs leading-relaxed text-faint">
      En continuant, vous acceptez que vos indisponibilités soient partagées à vos groupes
      sous forme de plages occupées, jamais leur motif.
    </p>
  </main>
</template>
