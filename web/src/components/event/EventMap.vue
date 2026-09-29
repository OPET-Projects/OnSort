<script setup lang="ts">
import { computed } from 'vue'
import type { Activity } from '../../composables/useActivities'
import type { MapConfig } from '../../composables/useMapConfig'
import MapView from '../MapView.vue'

const props = defineProps<{
  activities: Activity[]
  config: MapConfig | null
  error: string
}>()

// Seules les activités dont l'adresse a été reconnue portent un point. Les autres ne sont
// pas des erreurs : elles n'ont simplement pas de lieu à montrer.
const points = computed(() =>
  props.activities
    .filter((activity) => activity.lat !== null && activity.lng !== null)
    .map((activity, index) => ({
      id: activity.id,
      title: activity.title,
      lat: activity.lat as number,
      lng: activity.lng as number,
      position: index + 1,
    })),
)
</script>

<template>
  <section class="flex flex-col gap-4">
    <p v-if="error" class="text-sm text-fail-ink">{{ error }}</p>

    <p
      v-else-if="points.length === 0"
      class="rounded-card border border-dashed border-field p-6 text-center text-[13px] leading-relaxed text-muted"
    >
      Aucune activité n'a d'adresse reconnue. Renseignez le champ « où ? » d'une activité dans
      l'onglet Programme, et elle apparaîtra ici.
    </p>

    <template v-else-if="config">
      <div class="overflow-hidden rounded-card border border-line">
        <MapView :points="points" :tiles-url="config.tilesUrl" :attribution="config.attribution" />
      </div>

      <ol class="flex flex-col gap-2.5">
        <li v-for="point in points" :key="point.id" class="flex items-center gap-3 text-sm">
          <span
            class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white"
          >
            {{ point.position }}
          </span>
          <span class="font-medium">{{ point.title }}</span>
        </li>
      </ol>
    </template>
  </section>
</template>
