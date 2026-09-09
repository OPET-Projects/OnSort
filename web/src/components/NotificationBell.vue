<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStream } from '../composables/useUserStream'
import { describeNotification, notificationLink } from '../lib/notifications'
import { useNotificationsStore } from '../stores/notifications'

const router = useRouter()
const store = useNotificationsStore()
const open = ref(false)

// Le flux ne porte que `{ type, id }` : on recharge la liste plutôt que d'y insérer un objet
// construit côté client, qui divergerait du jour où le rendu changerait (conception §5.2).
useUserStream(() => {
  void store.refresh()
})

void store.refresh()

async function follow(id: string, target: string | null): Promise<void> {
  open.value = false
  await store.markRead(id)

  if (target !== null) {
    void router.push(target)
  }
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative rounded border border-neutral-300 px-3 py-2 text-sm"
      :aria-label="`Notifications, ${store.unread} non lues`"
      @click="open = !open"
    >
      Notifications
      <span
        v-if="store.unread > 0"
        class="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1 text-xs text-white"
      >
        {{ store.unread }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-10 mt-1 w-80 max-w-[90vw] overflow-hidden rounded border border-neutral-200 bg-white shadow-lg"
    >
      <p v-if="store.notifications.length === 0" class="p-4 text-sm text-neutral-600">
        Aucune notification.
      </p>

      <ul v-else class="max-h-96 divide-y divide-neutral-100 overflow-y-auto">
        <li v-for="notification in store.notifications" :key="notification.id">
          <button
            type="button"
            class="block w-full px-4 py-3 text-left text-sm hover:bg-neutral-50"
            :class="notification.readAt === null ? 'font-medium' : 'text-neutral-500'"
            @click="follow(notification.id, notificationLink(notification))"
          >
            {{ describeNotification(notification) }}
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
