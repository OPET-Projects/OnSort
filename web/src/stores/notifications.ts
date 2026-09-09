import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/http'

export type Notification = {
  id: string
  type: string
  eventId: string | null
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

// Magasin **global**, comme la session : la conception §6.2 en prévoit exactement deux, et
// c'est le second. Les notifications suivent l'utilisateur d'un écran à l'autre — les loger
// dans un composable monté avec une vue les ferait disparaître à chaque navigation.
export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const unread = ref(0)
  const loaded = ref(false)

  async function refresh(): Promise<void> {
    try {
      const body = await apiFetch<{ notifications: Notification[]; unread: number }>(
        '/api/notifications',
      )
      notifications.value = body.notifications
      unread.value = body.unread
      loaded.value = true
    } catch {
      // Une cloche muette n'empêche pas d'utiliser l'application : l'échec ne remonte pas
      // jusqu'à l'écran, qui n'aurait rien à en faire.
      loaded.value = true
    }
  }

  async function markRead(id: string): Promise<void> {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' })
    await refresh()
  }

  return { notifications, unread, loaded, refresh, markRead }
})
