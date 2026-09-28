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
    // Réglage de présence (§3.4), changeable à tout moment — mais par un administrateur
    // seul, ce que le service vérifie : le schéma ne décrit que la forme.
    attendanceMode: z.enum(['all', 'optional']),
  })
  .partial()

// Le réordonnancement reçoit la **liste complète** des identifiants, pas un déplacement :
// « monte celle-ci d'un cran » dépendrait de l'ordre supposé par le client, qui peut être
// périmé. Une liste complète est vérifiable — le service exige qu'elle contienne exactement
// les activités de l'événement.
export const reorderActivitiesSchema = z.object({
  activityIds: z.array(z.uuid()).min(1),
})

export const attendanceSchema = z.object({
  present: z.boolean(),
})

// Un booléen plutôt que deux routes : annuler et rétablir sont le même geste dans les deux
// sens, et §3.7 n'a pas d'état absorbant à protéger.
export const cancelSchema = z.object({
  cancelled: z.boolean(),
})

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
