<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'

export type MapPoint = {
  id: string
  title: string
  lat: number
  lng: number
  position: number
}

const props = defineProps<{
  points: MapPoint[]
  tilesUrl: string
  attribution: string
}>()

const container = useTemplateRef<HTMLDivElement>('container')

// Leaflet est instancié à la main, sans greffon (conception §6.5). Le support Vue 3 des
// enveloppes existantes a longtemps été incomplet, et ces quelques lignes sont plus courtes
// que leur documentation.
let map: L.Map | null = null
let markers: L.LayerGroup | null = null

// Zoom retenu quand un seul point est placé : `fitBounds` sur une boîte de surface nulle
// pousse Leaflet à son zoom maximal, et l'on se retrouve sur trois pavés de bitume.
const SINGLE_POINT_ZOOM = 15

// Pin numéroté dans l'ordre du programme. Une icône construite en HTML plutôt qu'une image :
// le numéro est la seule information qui compte ici, et l'icône par défaut de Leaflet exige
// des chemins d'images que le bundler ne résout pas sans configuration.
function numberedIcon(position: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-neutral-900 text-xs font-medium text-white shadow">${position}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function draw(): void {
  if (map === null) {
    return
  }

  markers?.remove()
  markers = L.layerGroup(
    props.points.map((point, index) =>
      L.marker([point.lat, point.lng], { icon: numberedIcon(index + 1) }).bindPopup(
        // Le titre vient de la saisie d'un participant : il est inséré comme texte, jamais
        // interprété comme du HTML.
        document.createTextNode(point.title).textContent ?? '',
      ),
    ),
  ).addTo(map)

  const positions = props.points.map((point) => [point.lat, point.lng] as [number, number])

  if (positions.length === 1 && positions[0] !== undefined) {
    map.setView(positions[0], SINGLE_POINT_ZOOM)
    return
  }

  if (positions.length > 1) {
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] })
  }
}

onMounted(() => {
  if (container.value === null) {
    return
  }

  map = L.map(container.value, { scrollWheelZoom: false })
  L.tileLayer(props.tilesUrl, {
    // L'attribution est rendue par Leaflet en bas de carte, et n'est jamais masquée : c'est
    // une condition de la politique d'usage des tuiles OpenStreetMap, pas un ornement.
    attribution: props.attribution,
    maxZoom: 19,
  }).addTo(map)

  draw()
})

watch(() => props.points, draw, { deep: true })

onUnmounted(() => {
  // Sans cette destruction, naviguer d'un événement à l'autre laisserait une carte par
  // événement visité, avec ses écouteurs et sa boucle d'animation.
  map?.remove()
  map = null
  markers = null
})
</script>

<template>
  <!--
    Une hauteur explicite est indispensable : Leaflet mesure son conteneur au montage, et un
    conteneur de hauteur nulle produit une carte invisible sans la moindre erreur.
  -->
  <div ref="container" class="h-96 w-full rounded border border-neutral-200"></div>
</template>
