<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
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
  <main class="mx-auto max-w-2xl p-6 md:p-10">
    <header>
      <h1 class="text-2xl font-semibold">Mes indisponibilités</h1>
      <p class="mt-1 text-sm text-neutral-600">
        Vos groupes voient que vous êtes occupé, jamais pourquoi. Le libellé ne quitte pas
        cette page.
      </p>
    </header>

    <p v-if="state === 'loading'" class="mt-6 text-sm text-neutral-500">Chargement…</p>

    <div v-else-if="state === 'error'" class="mt-6 text-sm text-red-700">
      <p>{{ error }}</p>
      <button type="button" class="mt-2 underline" @click="reload()">Réessayer</button>
    </div>

    <template v-else>
      <p v-if="state === 'empty'" class="mt-6 text-sm text-neutral-600">
        Aucune indisponibilité déclarée. Tant que cette liste est vide, vous êtes libre pour
        vos groupes.
      </p>

      <ul v-else class="mt-6 flex flex-col gap-2">
        <li
          v-for="row in unavailability"
          :key="row.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 p-3 text-sm"
        >
          <span class="min-w-0">
            {{ formatSlot(row.startsAt, row.endsAt) }}
            <span class="text-xs text-neutral-500">
              · {{ formatDuration(row.startsAt, row.endsAt) }}
            </span>
            <span v-if="row.label" class="block text-xs text-neutral-500 italic">
              {{ row.label }}
            </span>
          </span>
          <button
            type="button"
            class="shrink-0 rounded border border-neutral-300 px-3 py-1 text-xs"
            @click="remove(row.id)"
          >
            Retirer
          </button>
        </li>
      </ul>

      <form class="mt-6 flex flex-col gap-2 border-t border-neutral-100 pt-4" @submit.prevent="submit">
        <h2 class="text-sm font-medium">Déclarer une indisponibilité</h2>

        <label class="flex flex-col gap-1 text-sm">
          <span>Du</span>
          <input
            v-model="draft.startsAt"
            type="datetime-local"
            required
            class="rounded border border-neutral-300 px-3 py-2 text-base"
          />
        </label>

        <label class="flex flex-col gap-1 text-sm">
          <span>Au</span>
          <input
            v-model="draft.endsAt"
            type="datetime-local"
            required
            class="rounded border border-neutral-300 px-3 py-2 text-base"
          />
        </label>

        <label class="flex flex-col gap-1 text-sm">
          <span>Motif (privé, facultatif)</span>
          <input
            v-model="draft.label"
            type="text"
            maxlength="200"
            placeholder="Congés, examen…"
            class="rounded border border-neutral-300 px-3 py-2 text-base"
          />
        </label>

        <button
          type="submit"
          :disabled="busy"
          class="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Enregistrer
        </button>

        <!--
          Sans cette phrase, voir deux saisies devenir une seule ligne passe pour un bogue.
        -->
        <p class="text-xs text-neutral-500">
          Les plages qui se touchent ou se recouvrent sont réunies en une seule.
        </p>
        <p v-if="formError" class="text-sm text-red-700">{{ formError }}</p>
      </form>
    </template>

    <RouterLink to="/groups" class="mt-8 inline-block text-sm underline">
      Voir mes groupes
    </RouterLink>
  </main>
</template>
