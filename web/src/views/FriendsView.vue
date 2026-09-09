<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useFriends } from '../composables/useFriends'

const { state, friends, received, sent, error, requestSent, reload, ask, accept, decline } =
  useFriends()

const email = ref('')
const formError = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  formError.value = ''
  busy.value = true

  try {
    await ask(email.value)
    email.value = ''
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : "L'envoi a échoué."
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-2xl p-6 md:p-10">
    <header>
      <h1 class="text-2xl font-semibold">Mes amis</h1>
      <p class="mt-1 text-sm text-neutral-600">
        Vos amis n'ont accès à rien de plus : la liste sert à retrouver quelqu'un pour
        l'inviter, pas à partager vos sorties.
      </p>
    </header>

    <p v-if="state === 'loading'" class="mt-6 text-sm text-neutral-500">Chargement…</p>

    <div v-else-if="state === 'error'" class="mt-6 text-sm text-red-700">
      <p>{{ error }}</p>
      <button type="button" class="mt-2 underline" @click="reload()">Réessayer</button>
    </div>

    <template v-else>
      <section v-if="received.length > 0" class="mt-6">
        <h2 class="text-sm font-medium">Demandes reçues</h2>
        <ul class="mt-2 flex flex-col gap-2">
          <li
            v-for="request in received"
            :key="request.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 p-3 text-sm"
          >
            <span>{{ request.from.name }} veut vous ajouter en ami.</span>
            <span class="flex gap-2">
              <button
                type="button"
                class="rounded bg-neutral-900 px-3 py-1 text-xs text-white"
                @click="accept(request.id)"
              >
                Accepter
              </button>
              <button
                type="button"
                class="rounded border border-neutral-300 px-3 py-1 text-xs"
                @click="decline(request.id)"
              >
                Refuser
              </button>
            </span>
          </li>
        </ul>
      </section>

      <section class="mt-6">
        <h2 class="text-sm font-medium">Amis</h2>

        <p v-if="friends.length === 0" class="mt-2 text-sm text-neutral-600">
          Aucun ami pour l'instant. Ajoutez quelqu'un par son adresse ci-dessous.
        </p>

        <ul v-else class="mt-2 divide-y divide-neutral-100">
          <li v-for="friend in friends" :key="friend.userId" class="py-2 text-sm">
            {{ friend.name }}
          </li>
        </ul>
      </section>

      <section v-if="sent.length > 0" class="mt-6">
        <h2 class="text-sm font-medium">Demandes envoyées</h2>
        <ul class="mt-2 divide-y divide-neutral-100">
          <li
            v-for="request in sent"
            :key="request.id"
            class="flex items-center justify-between py-2 text-sm text-neutral-500"
          >
            <span>{{ request.to.name }}</span>
            <span class="text-xs">En attente</span>
          </li>
        </ul>
      </section>

      <form class="mt-8 flex flex-col gap-2 border-t border-neutral-100 pt-4" @submit.prevent="submit">
        <h2 class="text-sm font-medium">Ajouter un ami</h2>
        <div class="flex gap-2">
          <input
            v-model="email"
            type="email"
            required
            placeholder="adresse@exemple.fr"
            class="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 text-base"
          />
          <button
            type="submit"
            :disabled="busy"
            class="shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Envoyer
          </button>
        </div>

        <!--
          La réponse de l'API est identique que le compte existe ou non (conception §4) :
          l'interface ne peut donc rien affirmer de plus que ceci.
        -->
        <p v-if="requestSent" class="text-xs text-neutral-500">
          Si un compte existe pour cette adresse, la demande lui a été transmise ; sinon une
          invitation vient de partir.
        </p>
        <p v-if="formError" class="text-sm text-red-700">{{ formError }}</p>
      </form>
    </template>

    <RouterLink to="/" class="mt-8 inline-block text-sm underline">Tableau de bord</RouterLink>
  </main>
</template>
