import { onMounted, onUnmounted } from 'vue'

// Flux personnel (conception §5.2). Les messages ne portent que `{ type, id }` : le client
// recharge la liste, ce qui évite de dupliquer les règles d'affichage dans le flux.
export function useUserStream(onNotification: () => void) {
  let source: EventSource | null = null

  onMounted(() => {
    source = new EventSource('/api/me/stream')
    source.addEventListener('notification.created', () => onNotification())
  })

  onUnmounted(() => {
    // Sans cette fermeture, chaque montage laisserait une connexion ouverte de plus, et un
    // abonné mort dans le bus côté serveur.
    source?.close()
    source = null
  })
}
