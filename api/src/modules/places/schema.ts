import { z } from 'zod'

// Recherche de lieu (decisions-techniques §2.7). La borne haute n'est pas décorative : la
// route relaie un service public gratuit, et rien ne doit permettre d'en tirer des pages
// entières à travers nous.
export const placeQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(5),
})

export type PlaceQueryInput = z.infer<typeof placeQuerySchema>
