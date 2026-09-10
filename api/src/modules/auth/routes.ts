import { Hono } from 'hono'
import { config } from '../../config.ts'

// Quels fournisseurs de connexion sont configurés. Sans session : l'écran de connexion la
// consulte avant que quiconque soit connecté.
//
// Le front ne lit pas cette information dans une variable `VITE_` : elle vaudrait celle de
// la construction de l'image, pas celle du serveur qui répond. Un bouton proposé alors que
// les clés manquent mènerait l'utilisateur droit sur une erreur du fournisseur.
export const authProvidersRoutes = new Hono().get('/auth-providers', (c) => {
  return c.json({ google: config.google !== null })
})
