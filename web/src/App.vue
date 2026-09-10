<script setup lang="ts">
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import AppNav from './components/AppNav.vue'
import NotificationBell from './components/NotificationBell.vue'
import { useSessionStore } from './stores/session'

const session = useSessionStore()

// La cloche vit dans la coque de l'application, pas dans une vue. Montée avec le tableau de
// bord, elle ne recevait rien dès qu'on ouvrait un événement — or c'est précisément là qu'on
// passe son temps, et c'est là que les votes et les dépenses arrivent. Le flux personnel est
// ouvert par la cloche : le déplacer, c'est le rendre continu d'un écran à l'autre.
const signedIn = computed(() => session.status === 'authenticated')
</script>

<template>
  <div class="flex min-h-screen">
    <AppNav v-if="signedIn" />

    <!--
      La barre basse recouvre le bas de l'écran sur téléphone : le rembourrage lui rend sa
      place, sans quoi la dernière ligne de chaque vue passerait dessous.
    -->
    <div class="min-w-0 flex-1" :class="signedIn ? 'pb-24 md:pb-0' : ''">
      <div
        v-if="signedIn"
        class="pointer-events-none fixed top-3 right-3 z-20 flex justify-end"
      >
        <div class="pointer-events-auto">
          <NotificationBell />
        </div>
      </div>

      <RouterView />
    </div>
  </div>
</template>
