import { isoToLocalInput } from './dates'

// Lien vers le formulaire de création, porteur d'un groupe et, depuis un créneau libre, de
// ses bornes. Les dates voyagent en ISO dans l'URL — sans ambiguïté de fuseau — et ne
// deviennent de l'heure locale qu'à la lecture.

type Slot = { startsAt: string; endsAt: string }

export function newEventLink(groupId: string, slot?: Slot) {
  const query: Record<string, string> =
    slot === undefined
      ? { group: groupId }
      : { group: groupId, startsAt: slot.startsAt, endsAt: slot.endsAt }

  return { path: '/events/new' as const, query }
}

function readInstant(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return ''
  }
  return isoToLocalInput(value)
}

export function readEventDraft(query: Record<string, unknown>) {
  return {
    groupId: typeof query.group === 'string' && query.group !== '' ? query.group : null,
    startsAt: readInstant(query.startsAt),
    endsAt: readInstant(query.endsAt),
  }
}
