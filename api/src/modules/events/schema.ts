import { z } from 'zod'

// Schémas des corps de requête du module « événements ». Ils décrivent la forme ; la règle
// « la fin suit le début » est vérifiée en service, pour porter le code d'erreur
// `invalid_period` plutôt qu'un `validation_error` générique.

export const createEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
})

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    status: z.enum(['draft', 'active', 'closed']),
  })
  .partial()

export const rsvpSchema = z.object({
  rsvp: z.enum(['accepted', 'declined']),
})

export const inviteSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('link'),
    expiresInHours: z.number().int().positive().max(8760).optional(),
  }),
  z.object({
    kind: z.literal('email'),
    email: z.email(),
  }),
])

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type InviteInput = z.infer<typeof inviteSchema>
