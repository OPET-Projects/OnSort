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
  <main class="mx-auto max-w-2xl p-6 md:p-10">
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Chargement…</p>

    <div v-else-if="state === 'error'" class="text-sm text-red-700">
      <p>{{ error }}</p>
      <button type="button" class="mt-2 underline" @click="reload()">Réessayer</button>
    </div>

    <template v-else-if="group && calendar">
      <header>
        <h1 class="text-2xl font-semibold">{{ group.name }}</h1>
        <p class="mt-1 text-sm text-neutral-600">
          {{ group.members.length }}
          {{ group.members.length > 1 ? 'membres' : 'membre' }}
        </p>
      </header>

      <div class="mt-6 flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-4">
        <label class="flex flex-col gap-1 text-sm">
          <span>Sur les</span>
          <select v-model.number="windowDays" class="rounded border border-neutral-300 px-2 py-1 text-sm">
            <option :value="7">7 jours</option>
            <option :value="30">30 jours</option>
            <option :value="90">90 jours</option>
          </select>
        </label>

        <label class="flex flex-col gap-1 text-sm">
          <span>Créneaux d'au moins</span>
          <select
            v-model.number="minimumMinutes"
            class="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option :value="0">n'importe quelle durée</option>
            <option :value="120">2 heures</option>
            <option :value="480">8 heures</option>
            <option :value="1440">1 jour</option>
          </select>
        </label>

        <button
          type="button"
          class="rounded bg-neutral-900 px-3 py-1 text-sm text-white"
          @click="applyWindow"
        >
          Actualiser
        </button>
      </div>

      <div class="mt-6">
        <FreeSlots
          :free="calendar.free"
          :busy="calendar.busy"
          :window-days="windowDays"
        />
      </div>

      <section class="mt-8 border-t border-neutral-100 pt-6">
        <h2 class="text-sm font-medium">Membres</h2>
        <ul class="mt-2 divide-y divide-neutral-100">
          <li
            v-for="member in group.members"
            :key="member.userId"
            class="flex items-center justify-between py-2 text-sm"
          >
            <span>{{ member.name }}</span>
            <span v-if="member.role === 'admin'" class="text-xs text-neutral-500">admin</span>
          </li>
        </ul>
      </section>

      <section v-if="group.viewer.role === 'admin'" class="mt-8 rounded border border-neutral-200 p-4">
        <h2 class="text-sm font-medium">Inviter</h2>
        <form class="mt-2 flex flex-col gap-2" @submit.prevent="submitInvite">
          <div class="flex gap-2">
            <input
              v-model="email"
              type="email"
              required
              placeholder="adresse@exemple.fr"
              class="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <button type="submit" class="rounded bg-neutral-900 px-3 py-1 text-sm text-white">
              Envoyer
            </button>
          </div>
          <!--
            La réponse est identique que l'adresse ait un compte ou non (conception §4) :
            l'interface ne peut donc rien affirmer de plus que ceci.
          -->
          <p v-if="inviteSent" class="text-xs text-neutral-500">
            Si un compte existe pour cette adresse, l'invitation lui a été transmise ; sinon
            un courriel d'invitation vient de partir.
          </p>
          <p v-if="inviteError" class="text-sm text-red-700">{{ inviteError }}</p>
        </form>
      </section>

      <!--
        La première fois, on n'a rien déclaré : un calendrier vide sans porte de sortie est
        une impasse.
      -->
      <RouterLink to="/me/calendar" class="mt-8 inline-block text-sm underline">
        Déclarer mes indisponibilités
      </RouterLink>
    </template>
  </main>
</template>
