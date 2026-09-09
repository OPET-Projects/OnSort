import { z } from 'zod'

// Schémas des corps de requête du module « dépenses ». Le montant est un **entier de
// centimes strictement positif** : c'est ici, à la frontière, qu'un flottant est refusé —
// avant que le domaine financier ne le voie.
//
// Le plafond est un garde-fou de saisie, pas une règle métier : il arrête un doigt qui
// glisse sur le pavé numérique bien avant la limite des entiers sûrs.
const amountCents = z.int().positive().max(100_000_000)

export const createExpenseSchema = z.object({
  label: z.string().trim().min(1).max(200),
  amountCents,
  splitMode: z.enum(['equal', 'percent', 'fixed']).default('equal'),
  activityId: z.uuid().nullish(),
  // Absente, la dépense est partagée entre tous les participants ayant accepté. Fournie,
  // elle restreint le partage — c'est ce que la présence pré-remplit (§3.4).
  beneficiaryIds: z.array(z.string()).min(1).optional(),
})

export const updateExpenseSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    amountCents,
    activityId: z.uuid().nullable(),
    beneficiaryIds: z.array(z.string()).min(1),
  })
  .partial()

export const declareSettlementSchema = z.object({
  toParticipantId: z.string().min(1),
  amountCents,
})

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>
export type DeclareSettlementInput = z.infer<typeof declareSettlementSchema>
