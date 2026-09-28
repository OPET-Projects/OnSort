<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const router = useRouter()

async function signOut() {
  await session.signOut()
  await router.push({ name: 'login' })
}
</script>

<!-- L'apparence vient de l'appelant, par `class` : carte de compte ou bouton flottant. -->
<template>
  <button
    type="button"
    aria-label="Se déconnecter"
    title="Se déconnecter"
    class="flex shrink-0 items-center justify-center"
    @click="signOut"
  >
    <svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M15 16l4-4-4-4" />
      <path d="M19 12H9" />
    </svg>
  </button>
</template>
