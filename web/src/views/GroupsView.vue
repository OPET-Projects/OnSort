<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useGroups } from '../composables/useGroups'

const router = useRouter()
const { state, groups, error, reload, create } = useGroups()

const name = ref('')
const formError = ref('')

async function submit(): Promise<void> {
  formError.value = ''

  try {
    const id = await create(name.value)
    name.value = ''
    void router.push(`/groups/${id}`)
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : 'La création a échoué.'
  }
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-6 md:p-10">
    <header>
      <h1 class="text-2xl font-semibold">Mes groupes</h1>
      <p class="mt-1 text-sm text-neutral-600">
        Un groupe réunit les gens avec qui vous sortez souvent, et superpose vos calendriers.
      </p>
    </header>

    <p v-if="state === 'loading'" class="mt-6 text-sm text-neutral-500">Chargement…</p>

    <div v-else-if="state === 'error'" class="mt-6 text-sm text-red-700">
      <p>{{ error }}</p>
      <button type="button" class="mt-2 underline" @click="reload()">Réessayer</button>
    </div>

    <template v-else>
      <p v-if="state === 'empty'" class="mt-6 text-sm text-neutral-600">
        Aucun groupe pour l'instant. Créez le premier ci-dessous.
      </p>

      <ul v-else class="mt-6 flex flex-col gap-2">
        <li v-for="group in groups" :key="group.id">
          <RouterLink
            :to="`/groups/${group.id}`"
            class="flex items-center justify-between rounded border border-neutral-200 p-4 text-sm"
          >
            <span class="font-medium">{{ group.name }}</span>
            <span class="text-xs text-neutral-500">
              {{ group.memberCount }}
              {{ group.memberCount > 1 ? 'membres' : 'membre' }}
              <span v-if="group.role === 'admin'">· admin</span>
            </span>
          </RouterLink>
        </li>
      </ul>

      <form class="mt-6 flex flex-col gap-2 border-t border-neutral-100 pt-4" @submit.prevent="submit">
        <h2 class="text-sm font-medium">Créer un groupe</h2>
        <input
          v-model="name"
          type="text"
          required
          maxlength="120"
          placeholder="Les copains, la coloc…"
          class="rounded border border-neutral-300 px-3 py-2 text-base"
        />
        <button type="submit" class="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
          Créer
        </button>
        <p v-if="formError" class="text-sm text-red-700">{{ formError }}</p>
      </form>
    </template>

    <RouterLink to="/me/calendar" class="mt-8 inline-block text-sm underline">
      Mes indisponibilités
    </RouterLink>
  </main>
</template>
