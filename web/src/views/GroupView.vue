<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import FreeSlots from '../components/FreeSlots.vue'
import { useGroup } from '../composables/useGroup'

const route = useRoute()
const id = String(route.params.id)

const { state, group, calendar, error, inviteSent, windowDays, minimumMinutes, reload, invite } =
  useGroup(id)

const email = ref('')
const inviteError = ref('')

async function submitInvite(): Promise<void> {
  inviteError.value = ''

  try {
    await invite(email.value)
    email.value = ''
  } catch (cause) {
    inviteError.value = cause instanceof Error ? cause.message : "L'invitation a échoué."
  }
}

async function applyWindow(): Promise<void> {
  await reload()
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl">
    <p v-if="state === 'loading'" class="px-5 py-7 text-sm text-muted">Chargement…</p>

    <div
      v-else-if="state === 'error'"
      class="m-5 flex flex-col items-start gap-3 rounded-card border border-fail-line bg-fail p-5"
    >
      <p class="text-sm text-fail-ink">{{ error }}</p>
      <button
        type="button"
        class="flex h-10 items-center rounded-control border border-fail-line bg-surface px-4 text-sm font-semibold text-fail-ink"
        @click="reload()"
      >
        Réessayer
      </button>
    </div>

    <template v-else-if="group && calendar">
      <header class="flex items-center gap-3 border-b border-line bg-surface px-5 py-4">
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line"
          aria-label="Revenir aux groupes"
          @click="$router.back()"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14.5 5 8 12l6.5 7" />
          </svg>
        </button>
        <span class="flex min-w-0 flex-col gap-0.5">
          <h1 class="truncate text-lg font-bold tracking-tight">{{ group.name }}</h1>
          <span class="text-xs text-muted">
            {{ group.members.length }}
            {{ group.members.length > 1 ? 'membres' : 'membre' }}
          </span>
        </span>
      </header>

      <div class="flex flex-col gap-6 px-5 py-6">
        <div class="flex flex-wrap items-end gap-2.5">
          <label class="flex flex-1 flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-label">Sur les</span>
            <select
              v-model.number="windowDays"
              class="h-11 rounded-control border border-field bg-surface px-3 text-[13px] font-medium outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
            >
              <option :value="7">7 jours</option>
              <option :value="30">30 jours</option>
              <option :value="90">90 jours</option>
            </select>
          </label>

          <label class="flex flex-1 flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-label">Créneaux d'au moins</span>
            <select
              v-model.number="minimumMinutes"
              class="h-11 rounded-control border border-field bg-surface px-3 text-[13px] font-medium outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
            >
              <option :value="0">n'importe quelle durée</option>
              <option :value="120">2 heures</option>
              <option :value="480">8 heures</option>
              <option :value="1440">1 jour</option>
            </select>
          </label>

          <button
            type="button"
            class="flex h-11 items-center rounded-control bg-ink px-4 text-sm font-semibold text-white"
            @click="applyWindow"
          >
            Actualiser
          </button>
        </div>

        <FreeSlots :free="calendar.free" :busy="calendar.busy" :window-days="windowDays" />

        <section class="flex flex-col gap-2">
          <h2 class="text-[13px] font-semibold text-label">Membres</h2>
          <ul class="flex flex-col rounded-card border border-line bg-surface">
            <li
              v-for="member in group.members"
              :key="member.userId"
              class="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
            >
              <span class="text-sm font-medium">{{ member.name }}</span>
              <span v-if="member.role === 'admin'" class="text-xs text-faint">admin</span>
            </li>
          </ul>
        </section>

        <section
          v-if="group.viewer.role === 'admin'"
          class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4"
        >
          <h2 class="text-sm font-semibold">Inviter</h2>
          <form class="flex flex-col gap-2.5" @submit.prevent="submitInvite">
            <div class="flex gap-2">
              <input
                v-model="email"
                type="email"
                required
                placeholder="adresse@exemple.fr"
                class="h-12 min-w-0 flex-1 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
              />
              <button
                type="submit"
                class="flex h-12 shrink-0 items-center rounded-control bg-accent px-4 text-sm font-semibold text-white"
              >
                Inviter
              </button>
            </div>
            <!--
              La réponse est identique que l'adresse ait un compte ou non (conception §4) :
              l'interface ne peut donc rien affirmer de plus que ceci.
            -->
            <p v-if="inviteSent" class="text-xs leading-relaxed text-faint">
              Si un compte existe pour cette adresse, l'invitation lui a été transmise ; sinon
              un courriel d'invitation vient de partir.
            </p>
            <p v-if="inviteError" class="text-sm text-fail-ink">{{ inviteError }}</p>
          </form>
        </section>

        <!--
          La première fois, on n'a rien déclaré : un calendrier vide sans porte de sortie est
          une impasse.
        -->
        <RouterLink to="/me/calendar" class="text-sm font-semibold text-accent">
          Déclarer mes indisponibilités
        </RouterLink>
      </div>
    </template>
  </main>
</template>
