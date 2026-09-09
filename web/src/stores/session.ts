import type { SessionUser } from 'api'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated'

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)
  const status = ref<SessionStatus>('unknown')

  async function fetchSession(): Promise<void> {
    try {
      const response = await fetch('/api/me', { credentials: 'include' })

      if (!response.ok) {
        user.value = null
        status.value = 'anonymous'
        return
      }

      const body = (await response.json()) as { user: SessionUser }
      user.value = body.user
      status.value = 'authenticated'
    } catch {
      // Une API injoignable (réseau coupé, DNS, connexion refusée) ne prouve pas que
      // l'utilisateur est connecté. Une exception non rattrapée ici remonterait dans le
      // garde de routeur asynchrone et bloquerait la navigation : on retombe donc sur
      // l'état anonyme, exactement comme pour un refus explicite.
      user.value = null
      status.value = 'anonymous'
    }
  }

  async function requestMagicLink(email: string, callbackURL = '/'): Promise<void> {
    const response = await fetch('/api/auth/sign-in/magic-link', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, callbackURL }),
    })

    if (!response.ok) {
      throw new Error("L'envoi du lien a échoué. Réessayez dans un instant.")
    }
  }

  return { user, status, fetchSession, requestMagicLink }
})
