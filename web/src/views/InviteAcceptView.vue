<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useInvite } from '../composables/useInvite'

const route = useRoute()
const router = useRouter()
const token = String(route.params.token)

const { state, message } = useInvite(token, {
  toLogin: () => {
    void router.replace({ name: 'login', query: { redirect: `/invite/${token}` } })
  },
  toEvent: (eventId) => {
    void router.replace(`/events/${eventId}`)
  },
})
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
    <h1 class="text-2xl font-semibold">On Sort ?</h1>

    <p v-if="state === 'working'" class="text-sm text-neutral-600">
      Ouverture de l'invitation…
    </p>

    <template v-else>
      <p class="text-sm text-red-700">{{ message }}</p>
      <RouterLink to="/" class="text-sm underline">Retour au tableau de bord</RouterLink>
    </template>
  </main>
</template>
