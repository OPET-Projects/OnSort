import { z } from 'zod'

// Demander quelqu'un en ami se fait par **adresse**, jamais par identifiant : un identifiant
// supposerait de savoir qui existe, ce que l'application ne dit jamais (conception §4).
export const friendRequestSchema = z.object({
  email: z.email(),
})

export type FriendRequestInput = z.infer<typeof friendRequestSchema>
