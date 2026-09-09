import { z } from 'zod'

// Sans borne, un compte ancien rendrait tout son historique à chaque ouverture de la cloche.
export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type FeedQueryInput = z.infer<typeof feedQuerySchema>
