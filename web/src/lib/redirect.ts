import type { LocationQuery, LocationQueryValue } from 'vue-router'

// Sépare le chemin de reprise après connexion de l'erreur d'authentification qui l'a
// provoqué.
//
// Better Auth ajoute `?error=…` à la cible de retour quand la vérification d'un lien
// magique échoue. Le garde de routeur mémorisait ce chemin **entier** dans `redirect` : le
// paramètre redevenait le `callbackURL` de la demande suivante, si bien qu'après une
// connexion réussie l'utilisateur atterrissait sur une URL portant une erreur déjà résolue.
// Pire, personne ne lisait ce paramètre : le lien périmé rejetait sur le formulaire sans un
// mot d'explication.

const first = (value: LocationQueryValue | LocationQueryValue[]): string => {
  const single = Array.isArray(value) ? value[0] : value
  return typeof single === 'string' ? single : ''
}

export function splitAuthError(
  path: string,
  query: LocationQuery | Record<string, unknown>,
): { redirect: string; error: string } {
  const entries = Object.entries(query as LocationQuery)
  const error = entries.find(([key]) => key === 'error')?.[1]

  const kept = new URLSearchParams()
  for (const [key, value] of entries) {
    if (key === 'error') continue

    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string') kept.append(key, item)
    }
  }

  const search = kept.toString()

  return {
    redirect: search === '' ? path : `${path}?${search}`,
    error: error === undefined ? '' : first(error),
  }
}
