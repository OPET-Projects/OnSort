<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useSessionStore } from '../stores/session'

type Destination = {
  to: string
  label: string
  icon: 'outings' | 'groups' | 'calendar' | 'friends'
  owns: (path: string) => boolean
}

const session = useSessionStore()
const route = useRoute()

// Un événement appartient aux sorties, un groupe aux groupes : sans cette correspondance,
// ouvrir un événement éteindrait l'onglet courant et l'utilisateur perdrait sa position.
const destinations: Destination[] = [
  {
    to: '/',
    label: 'Sorties',
    icon: 'outings',
    owns: (path) => path === '/' || path.startsWith('/events'),
  },
  {
    to: '/groups',
    label: 'Groupes',
    icon: 'groups',
    owns: (path) => path.startsWith('/groups'),
  },
  {
    to: '/me/calendar',
    label: 'Calendrier',
    icon: 'calendar',
    owns: (path) => path.startsWith('/me/calendar'),
  },
  {
    to: '/friends',
    label: 'Amis',
    icon: 'friends',
    owns: (path) => path.startsWith('/friends'),
  },
]

const current = computed(() => destinations.find((destination) => destination.owns(route.path)))

const initials = computed(() => {
  const name = session.user?.name ?? ''

  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
})
</script>

<template>
  <aside
    class="hidden w-66 shrink-0 flex-col gap-6 border-r border-line bg-surface p-4 md:flex"
  >
    <div class="flex items-center gap-2.5 px-1.5">
      <span class="flex h-8.5 w-8.5 items-center justify-center rounded-control bg-accent">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20s6.5-4.7 6.5-9.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.3 12 20 12 20Z" class="text-white" stroke="white" />
          <circle cx="12" cy="10.4" r="2.2" stroke="white" />
        </svg>
      </span>
      <span class="text-base font-bold">On sort&nbsp;?</span>
    </div>

    <nav class="flex flex-col gap-1">
      <RouterLink
        v-for="destination in destinations"
        :key="destination.to"
        :to="destination.to"
        class="flex h-10.5 items-center gap-2.5 rounded-control px-3 text-sm"
        :class="
          destination === current
            ? 'bg-accent-soft font-semibold text-accent-press'
            : 'font-medium text-ink-2 hover:bg-fill'
        "
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path v-if="destination.icon === 'outings'" d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
          <template v-else-if="destination.icon === 'groups'">
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3 19c0-3.3 2.7-5.3 6-5.3s6 2 6 5.3" />
            <path d="M16 5.6a3 3 0 0 1 0 5.8" />
            <path d="M18 14.2c2.2.6 3.6 2.3 3.6 4.4" />
          </template>
          <template v-else-if="destination.icon === 'calendar'">
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
            <path d="M8 3v4M16 3v4M3.5 10h17" />
          </template>
          <template v-else>
            <circle cx="10" cy="8" r="3.2" />
            <path d="M4 19c0-3.3 2.7-5.3 6-5.3s6 2 6 5.3" />
            <path d="M18 8.5v5M15.5 11h5" />
          </template>
        </svg>
        {{ destination.label }}
      </RouterLink>
    </nav>

    <div class="mt-auto flex items-center gap-2.5 rounded-field border border-line p-3">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
        {{ initials }}
      </span>
      <span class="min-w-0">
        <span class="block text-[13px] font-semibold">{{ session.user?.name }}</span>
        <span class="block truncate text-[11px] text-faint">{{ session.user?.email }}</span>
      </span>
    </div>
  </aside>

  <!--
    Barre basse, sur téléphone seulement. Fixe plutôt que dans le flux : les vues défilent
    sous elle, et l'espace qu'elle occupe est rendu par le rembourrage bas de la coque.
  -->
  <nav
    class="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-line bg-surface px-2 pt-2.5 pb-5.5 md:hidden"
  >
    <RouterLink
      v-for="destination in destinations"
      :key="destination.to"
      :to="destination.to"
      class="flex w-17 flex-col items-center gap-1.5 py-1.5"
      :class="destination === current ? 'text-accent' : 'text-faint'"
    >
      <svg viewBox="0 0 24 24" class="h-5.5 w-5.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-if="destination.icon === 'outings'" d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
        <template v-else-if="destination.icon === 'groups'">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 19c0-3.3 2.7-5.3 6-5.3s6 2 6 5.3" />
          <path d="M16 5.6a3 3 0 0 1 0 5.8" />
          <path d="M18 14.2c2.2.6 3.6 2.3 3.6 4.4" />
        </template>
        <template v-else-if="destination.icon === 'calendar'">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M8 3v4M16 3v4M3.5 10h17" />
        </template>
        <template v-else>
          <circle cx="10" cy="8" r="3.2" />
          <path d="M4 19c0-3.3 2.7-5.3 6-5.3s6 2 6 5.3" />
          <path d="M18 8.5v5M15.5 11h5" />
        </template>
      </svg>
      <span class="text-[11px]" :class="destination === current ? 'font-semibold' : ''">
        {{ destination.label }}
      </span>
    </RouterLink>
  </nav>
</template>
