import { expect, it } from 'vitest'
import { splitAuthError } from '../src/lib/redirect.ts'

it('rend le chemin tel quel quand aucune erreur ne le porte', () => {
  expect(splitAuthError('/events/abc', {})).toEqual({ redirect: '/events/abc', error: '' })
})

it('conserve les paramètres utiles', () => {
  expect(splitAuthError('/invite/xyz', { from: 'mail' })).toEqual({
    redirect: '/invite/xyz?from=mail',
    error: '',
  })
})

// Better Auth ajoute `?error=…` à la cible de retour quand la vérification échoue. Sans ce
// tri, le paramètre voyage dans `redirect`, redevient le `callbackURL` de la demande
// suivante, et l'utilisateur atterrit sur une URL portant une erreur déjà résolue.
it("extrait l'erreur et la retire du chemin de reprise", () => {
  expect(splitAuthError('/', { error: 'INVALID_TOKEN' })).toEqual({
    redirect: '/',
    error: 'INVALID_TOKEN',
  })
})

it("retire l'erreur sans toucher aux autres paramètres", () => {
  expect(splitAuthError('/events/abc', { error: 'INVALID_TOKEN', tab: 'depenses' })).toEqual({
    redirect: '/events/abc?tab=depenses',
    error: 'INVALID_TOKEN',
  })
})

// Un paramètre répété arrive en tableau dans vue-router. Il ne doit pas devenir la chaîne
// « INVALID_TOKEN,EXPIRED_TOKEN » dans le message affiché.
it('ne retient que la première valeur d’une erreur répétée', () => {
  expect(splitAuthError('/', { error: ['INVALID_TOKEN', 'AUTRE'] })).toEqual({
    redirect: '/',
    error: 'INVALID_TOKEN',
  })
})

it('ignore un paramètre sans valeur', () => {
  expect(splitAuthError('/', { error: null })).toEqual({ redirect: '/', error: '' })
})
