import { z } from 'zod'

// Schémas des corps de requête du module « activités ». Ils décrivent la forme ; la règle
// « la fin suit le début » est vérifiée en service, pour porter le code `invalid_period`
// plutôt qu'un `validation_error` générique.

export const createActivitySchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.string().trim().max(100).default(''),
  address: z.string().trim().max(500).default(''),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
})

export const updateActivitySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    kind: z.string().trim().max(100),
    address: z.string().trim().max(500),
    startsAt: z.coerce.date().nullable(),
    endsAt: z.coerce.date().nullable(),
  })
  .partial()

export const voteSchema = z.object({
  value: z.enum(['for', 'against']),
})

// La décision ne peut viser que `accepted` ou `rejected` : `proposed` est l'état de départ,
// et y revenir passe par la même route — voir `decisionSchema` ci-dessous.
export const decisionSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'proposed']),
})

export type CreateActivityInput = z.infer<typeof createActivitySchema>
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>
