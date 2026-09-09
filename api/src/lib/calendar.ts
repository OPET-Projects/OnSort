// Arithmétique des intervalles du calendrier (conception §2.4). Fonctions pures, sans
// entrées-sorties : c'est là que porte l'effort de test, comme `lib/vote.ts` et
// `lib/money.ts`.
//
// **Convention de bornes : semi-ouvertes.** `startsAt` est inclus, `endsAt` est exclu. Deux
// créneaux adjacents ne se chevauchent donc pas, et tout test de chevauchement s'écrit
// `startsAt < autre.endsAt && endsAt > autre.startsAt`. L'écrire avec un `<=` quelque part
// ferait apparaître des conflits là où il n'y en a pas.

export type Interval = {
  startsAt: Date
  endsAt: Date
}

// Fusionne les plages qui se recouvrent **ou se touchent**. Se toucher n'est pas se
// chevaucher en bornes semi-ouvertes ; on fusionne quand même, parce que « occupé du 1 au 2 »
// suivi de « du 2 au 3 » est une seule absence, et parce que l'invariant de non-superposition
// de §2.4 est tenu ici, faute de la contrainte `EXCLUDE` écartée.
//
// Les intervalles reçus ne sont jamais modifiés : la fonction travaille sur des copies. Sans
// cela, fusionner des lignes lues en base modifierait ces lignes.
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  )

  const merged: Interval[] = []

  for (const current of sorted) {
    const last = merged.at(-1)

    if (last !== undefined && current.startsAt.getTime() <= last.endsAt.getTime()) {
      if (current.endsAt.getTime() > last.endsAt.getTime()) {
        last.endsAt = current.endsAt
      }
      continue
    }

    merged.push({ startsAt: current.startsAt, endsAt: current.endsAt })
  }

  return merged
}

// Créneaux libres sur une fenêtre : le complément des occupations, borné à la fenêtre. C'est
// le calcul qui porte la démonstration du jalon — « le créneau qui convient à tous ».
//
// Les occupations sont d'abord **découpées** à la fenêtre : une absence commencée la semaine
// précédente ne doit pas repousser le premier créneau libre hors du domaine demandé.
//
// `minimumMinutes` écarte les miettes. Un trou de quelques minutes entre deux réunions n'est
// pas un créneau de sortie, et l'afficher noierait les vrais.
export function freeSlots(
  window: Interval,
  busy: readonly Interval[],
  minimumMinutes = 0,
): Interval[] {
  const clipped = busy
    .map((interval) => ({
      startsAt: new Date(Math.max(interval.startsAt.getTime(), window.startsAt.getTime())),
      endsAt: new Date(Math.min(interval.endsAt.getTime(), window.endsAt.getTime())),
    }))
    .filter((interval) => interval.endsAt.getTime() > interval.startsAt.getTime())

  const slots: Interval[] = []
  let cursor = window.startsAt

  for (const interval of mergeIntervals(clipped)) {
    if (interval.startsAt.getTime() > cursor.getTime()) {
      slots.push({ startsAt: cursor, endsAt: interval.startsAt })
    }

    if (interval.endsAt.getTime() > cursor.getTime()) {
      cursor = interval.endsAt
    }
  }

  if (cursor.getTime() < window.endsAt.getTime()) {
    slots.push({ startsAt: cursor, endsAt: window.endsAt })
  }

  const minimumMs = minimumMinutes * 60_000

  return slots.filter((slot) => slot.endsAt.getTime() - slot.startsAt.getTime() >= minimumMs)
}
