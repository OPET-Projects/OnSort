import { ref } from 'vue'
import { apiFetch } from '../lib/http'

type Providers = { google: boolean }

// Quels boutons de connexion l'écran peut proposer. La réponse vient du serveur : les clés
// vivent dans son environnement, pas dans la construction du front.
export function useAuthProviders() {
  const google = ref(false)

  async function load(): Promise<void> {
    try {
      const providers = await apiFetch<Providers>('/api/auth-providers')
      google.value = providers.google
    } catch {
      // API injoignable : on n'affiche pas le bouton. Un bouton absent fait retomber sur le
      // lien magique ; un bouton présent mais mort mènerait sur une erreur du fournisseur.
      google.value = false
    }
  }

  void load()

  return { google }
}
