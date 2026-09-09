import { z } from 'zod'

// Schémas du module « groupes » (conception §2.3).

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

// Ajouter un membre se fait par **adresse**, jamais par identifiant d'utilisateur : un
// identifiant supposerait de savoir qui existe, ce que l'application ne dit jamais (§4).
export const inviteMemberSchema = z.object({
  email: z.email(),
})

export const calendarWindowSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  // Un trou de quelques minutes n'est pas un créneau de sortie.
  minimumMinutes: z.coerce.number().int().min(0).max(10_080).default(0),
})

export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>
export type CalendarWindowInput = z.infer<typeof calendarWindowSchema>
