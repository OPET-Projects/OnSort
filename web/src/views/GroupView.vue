<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FreeSlots from '../components/FreeSlots.vue'
import { useConfirm } from '../composables/useConfirm'
import { useGroup } from '../composables/useGroup'
import { formatPeriod } from '../lib/dates'
import { newEventLink } from '../lib/event-draft'

const route = useRoute()
const id = String(route.params.id)

const {
  state,
  group,
  calendar,
  error,
  inviteSent,
  windowDays,
  minimumMinutes,
  reload,
  invite,
  rename,
  setRole,
  removeMember,
} = useGroup(id)

const router = useRouter()
const { dialog, ask, answer } = useConfirm()
const actionError = ref('')
const renaming = ref(false)
const draftName = ref('')

async function run(action: () => Promise<unknown>): Promise<void> {
  actionError.value = ''
  try {
    await action()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : "L'action a échoué."
  }
}

function startRename(): void {
  draftName.value = group.value?.name ?? ''
  renaming.value = true
}

async function submitRename(): Promise<void> {
  await run(async () => {
    await rename(draftName.value)
    renaming.value = false
  })
}

async function removeOther(userId: string, name: string): Promise<void> {
  const confirmed = await ask({
    title: `Retirer ${name} du groupe ?`,
    message: 'Ses sorties restent inchangées. Un admin pourra le réinviter.',
    confirmLabel: 'Retirer',
  })
  if (!confirmed) return
  await run(async () => {
    await removeMember(userId)
    await reload()
  })
}

// Quitter renvoie à la liste : le groupe n'est plus lisible, qu'il existe encore ou non.
async function leaveGroup(): Promise<void> {
  const confirmed = await ask({
    title: 'Quitter ce groupe ?',
    message: 'Vos sorties restent inchangées. Il faudra une invitation pour revenir.',
    confirmLabel: 'Quitter',
  })
  if (!confirmed) return
  await run(async () => {
    if (group.value) await removeMember(group.value.viewer.userId)
    await router.push('/groups')
  })
}

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

const rsvpLabel: Record<string, string> = {
  invited: 'À confirmer',
  accepted: 'Vous participez',
  declined: 'Vous avez décliné',
}

const rsvpTone: Record<string, string> = {
  invited: 'text-wait-ink',
  accepted: 'text-muted',
  declined: 'text-muted',
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl lg:max-w-6xl">
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
        <form
          v-if="renaming"
          class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          @submit.prevent="submitRename"
        >
          <input
            v-model="draftName"
            type="text"
            required
            maxlength="120"
            aria-label="Nom du groupe"
            class="h-10 min-w-0 flex-1 rounded-control border border-field bg-surface px-3 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          />
          <button
            type="submit"
            class="flex h-10 items-center rounded-control bg-accent px-3.5 text-[13px] font-semibold text-white"
          >
            Enregistrer
          </button>
          <button
            type="button"
            class="flex h-10 items-center rounded-control border border-field px-3.5 text-[13px] font-semibold"
            @click="renaming = false"
          >
            Annuler
          </button>
        </form>
        <template v-else>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 class="truncate text-lg font-bold tracking-tight">{{ group.name }}</h1>
            <span class="text-xs text-muted">
              {{ group.members.length }}
              {{ group.members.length > 1 ? 'membres' : 'membre' }}
            </span>
          </span>
          <button
            v-if="group.viewer.role === 'admin'"
            type="button"
            class="flex h-9 shrink-0 items-center rounded-control border border-field px-3 text-[13px] font-semibold"
            @click="startRename"
          >
            Renommer
          </button>
        </template>
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

        <FreeSlots :group-id="group.id" :free="calendar.free" :busy="calendar.busy" :window-days="windowDays" />

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-[13px] font-semibold text-label">Sorties du groupe</h2>
              <RouterLink
                :to="newEventLink(group.id)"
                class="flex h-10 items-center rounded-control bg-accent px-4 text-sm font-semibold text-white"
              >
                Nouvelle sortie
              </RouterLink>
            </div>

            <p v-if="group.events.length === 0" class="text-[13px] text-muted">
              Aucune sortie pour l'instant. Choisissez un créneau libre ci-dessus.
            </p>

            <ul v-else class="flex flex-col rounded-card border border-line bg-surface">
              <li
                v-for="event in group.events"
                :key="event.id"
                class="border-b border-line-soft last:border-b-0"
              >
                <RouterLink :to="`/events/${event.id}`" class="flex flex-col gap-0.5 px-4 py-3">
                  <span class="text-sm font-medium">{{ event.title }}</span>
                  <span class="text-xs text-muted">
                    {{ formatPeriod(event.startsAt, event.endsAt) }}
                  </span>
                  <span v-if="event.rsvp" class="text-xs" :class="rsvpTone[event.rsvp]">
                    {{ rsvpLabel[event.rsvp] }}
                  </span>
                </RouterLink>
              </li>
            </ul>
          </section>

          <section class="flex flex-col gap-2">
            <h2 class="text-[13px] font-semibold text-label">Membres</h2>
            <ul class="flex flex-col rounded-card border border-line bg-surface">
              <li
                v-for="member in group.members"
                :key="member.userId"
                class="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
              >
                <span class="flex min-w-0 items-baseline gap-2">
                  <span class="truncate text-sm font-medium">{{ member.name }}</span>
                  <span v-if="member.role === 'admin'" class="text-xs text-faint">admin</span>
                </span>
                <span
                  v-if="group.viewer.role === 'admin' && member.userId !== group.viewer.userId"
                  class="flex shrink-0 gap-1.5"
                >
                  <button
                    type="button"
                    class="flex h-9 items-center rounded-control border border-field px-3 text-[13px] font-semibold"
                    @click="run(() => setRole(member.userId, member.role === 'admin' ? 'member' : 'admin'))"
                  >
                    {{ member.role === 'admin' ? 'Rétrograder' : 'Promouvoir' }}
                  </button>
                  <button
                    type="button"
                    class="flex h-9 items-center rounded-control border border-field px-3 text-[13px] font-semibold text-fail-ink"
                    @click="removeOther(member.userId, member.name)"
                  >
                    Retirer
                  </button>
                </span>
              </li>
            </ul>
            <p v-if="actionError" class="text-sm text-fail-ink">{{ actionError }}</p>
          </section>
        </div>

        <section
          v-if="group.viewer.role === 'admin'"
          class="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4"
        >
          <h2 class="text-sm font-semibold">Inviter</h2>
          <form class="flex flex-col gap-2.5" @submit.prevent="submitInvite">
            <div class="flex gap-2">
              <input
                v-model="email"
                aria-label="Adresse de la personne à inviter"
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

        <button
          type="button"
          class="self-start text-sm font-semibold text-fail-ink"
          @click="leaveGroup"
        >
          Quitter le groupe
        </button>
      </div>
    </template>

    <ConfirmDialog v-bind="dialog" @answer="answer" />
  </main>
</template>
