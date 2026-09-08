<script setup lang="ts">
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
</script>

<template>
  <main class="mx-auto max-w-2xl p-6 md:p-10">
    <h1 class="text-2xl font-semibold">Bonjour {{ session.user?.name }}</h1>
    <p class="mt-2 text-neutral-600">{{ session.user?.email }}</p>
  </main>
</template>
