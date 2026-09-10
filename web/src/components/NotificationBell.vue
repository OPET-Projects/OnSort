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
      class="relative flex h-11 w-11 items-center justify-center rounded-field border border-line bg-surface shadow-rest"
      :aria-label="`Notifications, ${store.unread} non lues`"
      @click="open = !open"
    >
      <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
        <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5" />
        <path d="M10.5 19a1.8 1.8 0 0 0 3 0" />
      </svg>
      <span
        v-if="store.unread > 0"
        class="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-canvas bg-accent px-1 text-[11px] font-bold text-white"
      >
        {{ store.unread }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-10 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-card border border-line bg-surface shadow-float"
    >
      <p v-if="store.notifications.length === 0" class="p-4 text-[13px] text-muted">
        Aucune notification.
      </p>

      <ul v-else class="max-h-96 overflow-y-auto">
        <li v-for="notification in store.notifications" :key="notification.id">
          <button
            type="button"
            class="flex w-full items-start gap-2.5 border-b border-line-soft px-4 py-3 text-left last:border-b-0 hover:bg-canvas"
            :class="notification.readAt === null ? 'bg-accent-soft/40' : ''"
            @click="follow(notification.id, notificationLink(notification))"
          >
            <span
              class="mt-1.5 h-1.75 w-1.75 shrink-0 rounded-full"
              :class="notification.readAt === null ? 'bg-accent' : 'bg-transparent'"
            ></span>
            <span
              class="text-[13px] leading-relaxed"
              :class="notification.readAt === null ? 'font-semibold' : 'text-muted'"
            >
              {{ describeNotification(notification) }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
