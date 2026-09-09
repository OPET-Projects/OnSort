import { z } from 'zod'

// Schémas du calendrier personnel (conception §2.4). La règle « la fin suit le début » est
// vérifiée en service, pour porter le code `invalid_period` plutôt qu'un `validation_error`
// générique — c'est le même choix qu'en M2 pour les activités.

export const addUnavailabilitySchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  // Privé : il ne franchit jamais une réponse de groupe (§2.4).
  label: z.string().trim().max(200).nullish(),
})

export const windowSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export type AddUnavailabilityInput = z.infer<typeof addUnavailabilitySchema>
export type WindowInput = z.infer<typeof windowSchema>
