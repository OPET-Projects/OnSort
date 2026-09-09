import { prisma } from '../db.ts'
import type { Prisma } from '../generated/prisma/client.ts'
import { publish, userRoom } from './sse.ts'

// Émission d'une notification (conception §2.9). **Écrite puis diffusée, jamais seulement
// diffusée** : le flux sert à celui qui regarde, la table à celui qui revient. Diffuser sans
// écrire perdrait tout pour qui n'était pas connecté — c'est-à-dire le cas courant.

// Les dix types de §2.9, moins `activity.cancelled` : le type existe dans la conception,
// mais l'annulation qui le déclencherait arrive en M7.
export type NotificationType =
  | 'friend.request'
  | 'friend.accepted'
  | 'group.invited'
  | 'event.invited'
  | 'activity.proposed'
  | 'activity.decided'
  | 'expense.created'
  | 'settlement.declared'
  | 'settlement.confirmed'

type NotifyInput = {
  userIds: readonly string[]
  type: NotificationType
  eventId?: string | null
  // `InputJsonObject` et non `Record<string, unknown>` : Prisma refuse les valeurs qu'il ne
  // sait pas sérialiser en JSON, et le type le dit à la compilation plutôt qu'à l'exécution.
  payload?: Prisma.InputJsonObject
}

export async function notify(input: NotifyInput): Promise<void> {
  // Les doublons viennent naturellement d'une liste de bénéficiaires : personne ne doit
  // recevoir deux fois la même notification.
  const recipients = [...new Set(input.userIds)]

  if (recipients.length === 0) {
    return
  }

  try {
    const rows = await prisma.notification.createManyAndReturn({
      data: recipients.map((userId) => ({
        userId,
        type: input.type,
        eventId: input.eventId ?? null,
        payload: input.payload ?? {},
      })),
      select: { id: true, userId: true },
    })

    for (const row of rows) {
      // Le message ne porte que `{ type, id }` : le client recharge la ressource concernée
      // (§5.2). Le contenu voyagerait sinon vers un flux dont les droits ne sont pas
      // revérifiés à l'émission.
      publish(userRoom(row.userId), { type: 'notification.created', id: row.id })
    }
  } catch (error) {
    // **Une notification qui échoue n'échoue pas l'action.** Perdre une dépense saisie parce
    // qu'une ligne d'information n'a pas pu s'écrire serait le pire des échanges.
    console.warn(`Notification « ${input.type} » non émise :`, error)
  }
}
