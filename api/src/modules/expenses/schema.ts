import { z } from 'zod'

// Schémas des corps de requête du module « dépenses ». Le montant est un **entier de
// centimes strictement positif** : c'est ici, à la frontière, qu'un flottant est refusé —
// avant que le domaine financier ne le voie.
//
// Le plafond est un garde-fou de saisie, pas une règle métier : il arrête un doigt qui
// glisse sur le pavé numérique bien avant la limite des entiers sûrs.
const amountCents = z.int().positive().max(100_000_000)

// Une part fixée vaut zéro ou plus : quelqu'un peut ne rien devoir sur une dépense dont il
// bénéficie quand même.
const shareAmountCents = z.int().nonnegative().max(100_000_000)

const percentShares = z
  .array(z.object({ participantId: z.string().min(1), percent: z.int().nonnegative().max(100) }))
  .min(1)

const fixedShares = z
  .array(z.object({ participantId: z.string().min(1), amountCents: shareAmountCents }))
  .min(1)

const commonExpenseFields = {
  label: z.string().trim().min(1).max(200),
  amountCents,
  activityId: z.uuid().nullish(),
}

// Union **discriminée** sur `splitMode` plutôt que trois champs facultatifs : le schéma
// refuse ainsi les combinaisons absurdes — un mode `percent` sans pourcentages, des montants
// fixés sur un partage à parts égales — au lieu de les laisser au service.
export const createExpenseSchema = z.discriminatedUnion('splitMode', [
  z.object({
    ...commonExpenseFields,
    splitMode: z.literal('equal').default('equal'),
    // Absente, la dépense est partagée entre tous les participants ayant accepté. Fournie,
    // elle restreint le partage — c'est ce que la présence pré-remplit (§3.4).
    beneficiaryIds: z.array(z.string()).min(1).optional(),
  }),
  z.object({
    ...commonExpenseFields,
    splitMode: z.literal('percent'),
    // Les bénéficiaires sont ceux que la liste nomme : un second champ les désignant
    // pourrait le contredire.
    shares: percentShares,
  }),
  z.object({
    ...commonExpenseFields,
    splitMode: z.literal('fixed'),
    shares: fixedShares,
  }),
])

// La correction ne peut pas être une union discriminée : `splitMode` y est facultatif —
// corriger un libellé ne doit pas obliger à redire le mode, ni le faire retomber sur sa
// valeur par défaut, ce qui convertirait silencieusement la dépense.
export const updateExpenseSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    amountCents,
    activityId: z.uuid().nullable(),
    beneficiaryIds: z.array(z.string()).min(1),
    splitMode: z.enum(['equal', 'percent', 'fixed']),
    shares: z.union([percentShares, fixedShares]),
  })
  .partial()
  .refine(
    (input) =>
      input.shares === undefined ||
      (input.splitMode === 'percent' && input.shares.every((share) => 'percent' in share)) ||
      (input.splitMode === 'fixed' && input.shares.every((share) => 'amountCents' in share)),
    {
      message: 'La forme des parts doit suivre le mode de partage.',
      path: ['shares'],
    },
  )

export const declareSettlementSchema = z.object({
  toParticipantId: z.string().min(1),
  amountCents,
})

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>
export type DeclareSettlementInput = z.infer<typeof declareSettlementSchema>
