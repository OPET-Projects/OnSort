import { z } from 'zod'

// Réponse donnée en ouvrant une invitation. Les trois valeurs sont celles du RSVP
// (conception §2.5) : on entre dans l'événement en disant du même geste si l'on viendra.
// `invited` — « je ne sais pas encore » — est un état à part entière, pas une absence de
// réponse : il dit à l'organisateur que la question a été vue.
//
// Le défaut couvre l'ouverture d'un lien sans corps de requête.
export const respondSchema = z.object({
  rsvp: z.enum(['accepted', 'invited', 'declined']).default('accepted'),
})

export type RespondInput = z.infer<typeof respondSchema>
