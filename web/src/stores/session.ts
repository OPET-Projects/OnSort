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

  async function requestMagicLink(email: string, path = '/'): Promise<void> {
    // La cible est absolutisée sur l'origine du front. Better Auth résout un chemin relatif
    // contre sa propre `baseURL` : en développement, front et API n'ayant pas le même port,
    // le lien magique atterrissait sur l'API, où aucune page n'existe — l'invité ne
    // revenait donc jamais sur son invitation. L'origine reste vérifiée côté API contre
    // `trustedOrigins`, qui refuse toute autre cible par un 403.
    const callbackURL = new URL(path, window.location.origin).toString()

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

  // Rend l'URL du fournisseur au lieu d'y naviguer : une redirection déclenchée depuis le
  // magasin serait intestable, et la navigation est une affaire de vue.
  async function startGoogleSignIn(path = '/'): Promise<string> {
    // Même raison que pour le lien magique : Better Auth résout un `callbackURL` relatif
    // contre sa propre `baseURL`, pas contre le front.
    const callbackURL = new URL(path, window.location.origin).toString()

    const response = await fetch('/api/auth/sign-in/social', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL }),
    })

    if (!response.ok) {
      throw new Error('La connexion par Google a échoué. Réessayez dans un instant.')
    }

    const body = (await response.json()) as { url?: unknown }

    if (typeof body.url !== 'string') {
      throw new Error('La connexion par Google a échoué. Réessayez dans un instant.')
    }

    return body.url
  }

  return { user, status, fetchSession, requestMagicLink, startGoogleSignIn }
})
