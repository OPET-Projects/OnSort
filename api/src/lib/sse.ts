// Bus de diffusion des messages temps réel (conception §5.2). En mémoire, indexé par
// événement, un seul processus applicatif supposé — `LISTEN/NOTIFY` ne deviendrait
// nécessaire qu'en cas de passage à plusieurs.
//
// Ce module ne connaît ni Hono ni HTTP : la route SSE n'en est qu'un adaptateur. C'est ce
// qui rend le temps réel testable sans ouvrir de socket.

export type ServerEvent = {
  type: string
  [key: string]: unknown
}

export type Subscriber = (event: ServerEvent) => void

const rooms = new Map<string, Set<Subscriber>>()

// Rend la fonction de désabonnement. L'appeler deux fois est sans effet : une connexion
// peut être abandonnée puis démontée.
export function subscribe(eventId: string, subscriber: Subscriber): () => void {
  const room = rooms.get(eventId) ?? new Set<Subscriber>()
  room.add(subscriber)
  rooms.set(eventId, room)

  return () => {
    const current = rooms.get(eventId)

    if (current === undefined) {
      return
    }

    current.delete(subscriber)

    // Sans ce nettoyage, la carte conserverait un `Set` vide par événement jamais rouvert.
    if (current.size === 0) {
      rooms.delete(eventId)
    }
  }
}

export function publish(eventId: string, event: ServerEvent): void {
  const room = rooms.get(eventId)

  if (room === undefined) {
    return
  }

  // Copie délibérée : un abonné peut se désabonner pendant la diffusion — c'est le cas
  // d'un client qui abandonne sa requête — et itérer sur le `Set` en cours de modification
  // sauterait un destinataire.
  for (const subscriber of [...room]) {
    try {
      subscriber(event)
    } catch (error) {
      // Une connexion morte ne doit pas faire taire le flux des autres.
      console.error(`Diffusion vers un abonné de l'événement ${eventId} échouée :`, error)
    }
  }
}

export function subscriberCount(eventId: string): number {
  return rooms.get(eventId)?.size ?? 0
}
