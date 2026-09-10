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

// Un état se lit à la couleur avant de se lire au mot : en cours porte l'accent, une
// réponse encore due porte le ton d'attente, un événement clos s'efface.
const statusTone: Record<string, string> = {
  draft: 'bg-fill text-muted',
  active: 'bg-accent-soft text-accent',
  closed: 'bg-fill text-muted',
}

const rsvpTone: Record<string, string> = {
  invited: 'text-wait-ink',
  accepted: 'text-muted',
  declined: 'text-muted',
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl px-5 py-7 md:px-8 md:py-9">
    <header class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
      <div class="flex flex-col gap-1">
        <h1 class="text-[26px] font-bold tracking-tight">Bonjour {{ session.user?.name }}</h1>
        <p class="text-[13px] text-muted">
          {{ events.length }} {{ events.length > 1 ? 'sorties' : 'sortie' }} à votre nom
        </p>
      </div>

      <RouterLink
        to="/events/new"
        class="flex h-13 shrink-0 items-center justify-center gap-2 rounded-field bg-ink px-5 text-[15px] font-semibold text-white md:h-11"
      >
        <svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nouvelle sortie
      </RouterLink>
    </header>

    <section class="mt-7 flex flex-col gap-2.5">
      <h2 class="text-sm font-semibold">Vos événements</h2>

      <p v-if="state === 'loading'" class="text-sm text-muted">Chargement…</p>

      <div
        v-else-if="state === 'error'"
        class="flex flex-col items-start gap-3 rounded-card border border-fail-line bg-fail p-5"
      >
        <p class="text-sm text-fail-ink">{{ error }}</p>
        <button
          type="button"
          class="flex h-10 items-center rounded-control border border-fail-line bg-surface px-4 text-sm font-semibold text-fail-ink"
          @click="reload"
        >
          Réessayer
        </button>
      </div>

      <div
        v-else-if="state === 'empty'"
        class="flex flex-col items-center gap-3 rounded-card border border-dashed border-field p-7 text-center"
      >
        <span class="flex h-12 w-12 items-center justify-center rounded-card bg-accent-soft">
          <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
            <path d="M8 3v4M16 3v4M3.5 10h17" />
          </svg>
        </span>
        <p class="text-[15px] font-semibold">Aucune sortie pour l'instant</p>
        <p class="text-[13px] leading-relaxed text-muted">
          Créez-en une : la date, le programme et les comptes suivront.
        </p>
      </div>

      <ul v-else class="flex flex-col gap-2.5">
        <li v-for="event in events" :key="event.id">
          <RouterLink
            :to="`/events/${event.id}`"
            class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4 shadow-rest transition-colors hover:border-field"
            :class="event.status === 'closed' ? 'opacity-70' : ''"
          >
            <span class="flex items-start justify-between gap-2.5">
              <span class="text-[17px] font-semibold">{{ event.title }}</span>
              <span
                class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
                :class="statusTone[event.status]"
              >
                {{ statusLabel[event.status] }}
              </span>
            </span>
            <span class="text-[13px] text-ink-2">
              {{ formatPeriod(event.startsAt, event.endsAt) }}
            </span>
            <span class="text-[13px]" :class="rsvpTone[event.rsvp]">
              {{ rsvpLabel[event.rsvp] }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </main>
</template>
