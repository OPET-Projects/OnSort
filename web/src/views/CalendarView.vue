<script setup lang="ts">
import { ref } from 'vue'
import { useCalendar } from '../composables/useCalendar'
import { formatDuration, formatSlot } from '../lib/slots'

const { state, unavailability, error, reload, add, remove } = useCalendar()

const draft = ref({ startsAt: '', endsAt: '', label: '' })
const formError = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  formError.value = ''
  busy.value = true

  try {
    await add({
      // `datetime-local` rend une heure locale sans fuseau ; l'API attend un instant.
      startsAt: new Date(draft.value.startsAt).toISOString(),
      endsAt: new Date(draft.value.endsAt).toISOString(),
      label: draft.value.label === '' ? undefined : draft.value.label,
    })
    draft.value = { startsAt: '', endsAt: '', label: '' }
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : "L'ajout a échoué."
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto w-full max-w-2xl px-5 py-7 md:px-8 md:py-9">
    <header class="flex flex-col gap-1.5">
      <h1 class="text-[26px] font-bold tracking-tight">Mes indisponibilités</h1>
      <p class="text-[13px] leading-relaxed text-muted">
        Vos groupes voient que vous êtes occupé, jamais pourquoi. Le motif ne quitte pas cet
        écran.
      </p>
    </header>

    <p v-if="state === 'loading'" class="mt-6 text-sm text-muted">Chargement…</p>

    <div
      v-else-if="state === 'error'"
      class="mt-6 flex flex-col items-start gap-3 rounded-card border border-fail-line bg-fail p-5"
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

    <template v-else>
      <p
        v-if="state === 'empty'"
        class="mt-6 rounded-card border border-dashed border-field p-6 text-center text-[13px] leading-relaxed text-muted"
      >
        Aucune indisponibilité déclarée. Tant que cette liste est vide, vous êtes libre pour
        vos groupes.
      </p>

      <ul v-else class="mt-6 flex flex-col gap-2">
        <li
          v-for="row in unavailability"
          :key="row.id"
          class="flex items-center gap-3 rounded-field border border-line bg-surface p-3.5 shadow-rest"
        >
          <span class="w-1 self-stretch rounded-full bg-accent/35"></span>
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-sm font-semibold">
              {{ formatSlot(row.startsAt, row.endsAt) }}
            </span>
            <span class="text-xs text-faint">
              {{ formatDuration(row.startsAt, row.endsAt) }}
              <span v-if="row.label">· {{ row.label }}</span>
            </span>
          </span>
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line text-muted"
            :aria-label="`Retirer l'indisponibilité du ${formatSlot(row.startsAt, row.endsAt)}`"
            @click="remove(row.id)"
          >
            <svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
              <path d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M6.5 7l.8 11a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" />
            </svg>
          </button>
        </li>
      </ul>

      <form
        class="mt-6 flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4"
        @submit.prevent="submit"
      >
        <h2 class="text-sm font-semibold">Déclarer une indisponibilité</h2>

        <div class="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
          <label class="flex flex-1 flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-label">Du</span>
            <input
              v-model="draft.startsAt"
              type="datetime-local"
              required
              class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
            />
          </label>

          <label class="flex flex-1 flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-label">Au</span>
            <input
              v-model="draft.endsAt"
              type="datetime-local"
              required
              class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
            />
          </label>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-[13px] font-semibold text-label">Motif — privé, facultatif</span>
          <input
            v-model="draft.label"
            type="text"
            maxlength="200"
            placeholder="Congés, examen…"
            class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          />
        </label>

        <button
          type="submit"
          :disabled="busy"
          class="flex h-12 items-center justify-center rounded-control bg-accent text-[15px] font-semibold text-white disabled:opacity-50"
        >
          Enregistrer
        </button>

        <!--
          Sans cette phrase, voir deux saisies devenir une seule ligne passe pour un bogue.
        -->
        <p class="text-xs leading-relaxed text-faint">
          Les plages qui se touchent ou se recouvrent sont réunies en une seule.
        </p>
        <p v-if="formError" class="text-sm text-fail-ink">{{ formError }}</p>
      </form>
    </template>
  </main>
</template>
