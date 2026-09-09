import { Hono } from 'hono'
import { config } from '../../config.ts'
import { geocoder } from '../../lib/geocoder.ts'
import { queryParams } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { placeQuerySchema } from './schema.ts'

// Recherche de lieu et configuration de la carte.
//
// **La session est exigée sur les deux.** Sans elle, l'application deviendrait un mandataire
// de géocodage gratuit pour n'importe qui, sous notre identité auprès d'un service public —
// et c'est nous qui serions bloqués.
export const placesRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .get('/places', async (c) => {
    const { q, limit } = queryParams(placeQuerySchema, c.req.query())
    return c.json({ places: await geocoder.search(q, limit) })
  })
  // La configuration vient du serveur et n'est pas figée dans le front : changer de
  // fournisseur de tuiles ne coûte qu'un redémarrage, là où une variable `VITE_` aurait
  // demandé de reconstruire l'image et de redéployer.
  .get('/map/config', (c) => {
    return c.json({
      tilesUrl: config.mapTilesUrl,
      // Rendue telle quelle et jamais masquée : c'est une condition de la politique d'usage
      // des tuiles OpenStreetMap, pas un ornement.
      attribution: config.mapTilesAttribution,
    })
  })
