<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useEvents } from '../composables/useEvents'
import { formatPeriod } from '../lib/dates'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const { state, events, error, reload } = useEvents()

const statusLabel: Record<string, string> = {
  draft: 'Brouillon',
  active: 'En cours',
  closed: 'Clôturé',
}

const rsvpLabel: Record<string, string> = {
  invited: 'À confirmer',
  accepted: 'Vous participez',
  declined: 'Vous avez décliné',
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-6 md:p-10">
    <header class="flex items-baseline justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Bonjour {{ session.user?.name }}</h1>
        <p class="text-sm text-neutral-600">{{ session.user?.email }}</p>
      </div>
      <RouterLink
        to="/events/new"
        class="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
      >
        Nouvel événement
      </RouterLink>
    </header>

    <section class="mt-8">
      <h2 class="text-lg font-medium">Vos événements</h2>

      <p v-if="state === 'loading'" class="mt-4 text-sm text-neutral-500">Chargement…</p>

      <div v-else-if="state === 'error'" class="mt-4 text-sm text-red-700">
        <p>{{ error }}</p>
        <button type="button" class="mt-2 underline" @click="reload">Réessayer</button>
      </div>

      <p v-else-if="state === 'empty'" class="mt-4 text-sm text-neutral-600">
        Aucun événement pour l'instant. Créez-en un pour commencer à organiser une sortie.
      </p>

      <ul v-else class="mt-4 flex flex-col gap-3">
        <li v-for="event in events" :key="event.id">
          <RouterLink
            :to="`/events/${event.id}`"
            class="block rounded border border-neutral-200 p-4 hover:border-neutral-400"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium">{{ event.title }}</span>
              <span class="text-xs text-neutral-500">{{ statusLabel[event.status] }}</span>
            </div>
            <p class="mt-1 text-sm text-neutral-600">
              {{ formatPeriod(event.startsAt, event.endsAt) }}
            </p>
            <p class="mt-1 text-xs text-neutral-500">{{ rsvpLabel[event.rsvp] }}</p>
          </RouterLink>
        </li>
      </ul>
    </section>
  </main>
</template>
