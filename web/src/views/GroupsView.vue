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
  <main class="mx-auto w-full max-w-2xl px-5 py-7 md:px-8 md:py-9">
    <header class="flex flex-col gap-1.5">
      <h1 class="text-[26px] font-bold tracking-tight">Mes groupes</h1>
      <p class="text-[13px] leading-relaxed text-muted">
        Un groupe réunit les gens avec qui vous sortez souvent, et superpose vos calendriers.
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
        Aucun groupe pour l'instant. Créez le premier ci-dessous.
      </p>

      <ul v-else class="mt-6 flex flex-col gap-2.5">
        <li v-for="group in groups" :key="group.id">
          <RouterLink
            :to="`/groups/${group.id}`"
            class="flex items-center gap-3.5 rounded-card border border-line bg-surface p-4 shadow-rest transition-colors hover:border-field"
          >
            <span
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-accent-soft text-[15px] font-bold text-accent-press"
            >
              {{ group.name.slice(0, 2).toUpperCase() }}
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate text-base font-semibold">{{ group.name }}</span>
              <span class="text-[13px] text-muted">
                {{ group.memberCount }}
                {{ group.memberCount > 1 ? 'membres' : 'membre' }}
                <span v-if="group.role === 'admin'">· admin</span>
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>

      <form
        class="mt-6 flex flex-col gap-2.5 rounded-card border border-dashed border-field p-4"
        @submit.prevent="submit"
      >
        <h2 class="text-sm font-semibold">Créer un groupe</h2>
        <input
          v-model="name"
          type="text"
          required
          maxlength="120"
          placeholder="Les copains, la coloc…"
          class="h-12 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        <button
          type="submit"
          class="flex h-11 items-center justify-center rounded-control bg-ink text-sm font-semibold text-white"
        >
          Créer
        </button>
        <p v-if="formError" class="text-sm text-fail-ink">{{ formError }}</p>
      </form>
    </template>
  </main>
</template>
