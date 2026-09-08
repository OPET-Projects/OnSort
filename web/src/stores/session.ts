import type { SessionUser } from 'api'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated'

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)
  const status = ref<SessionStatus>('unknown')

  async function fetchSession(): Promise<void> {
    const response = await fetch('/api/me', { credentials: 'include' })

    if (!response.ok) {
      user.value = null
      status.value = 'anonymous'
      return
    }

    const body = (await response.json()) as { user: SessionUser }
    user.value = body.user
    status.value = 'authenticated'
  }

  async function requestMagicLink(email: string): Promise<void> {
    const response = await fetch('/api/auth/sign-in/magic-link', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/' }),
    })

    if (!response.ok) {
      throw new Error("L'envoi du lien a échoué. Réessayez dans un instant.")
    }
  }

  return { user, status, fetchSession, requestMagicLink }
})
