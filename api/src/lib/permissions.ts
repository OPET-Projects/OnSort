// Matrice des permissions de la conception §3.8. Les rôles et réponses sont passés en
// unions locales plutôt qu'importés du client Prisma généré : garder `lib/` sans dépendance
// au code généré.
export type ParticipantRole = 'admin' | 'member'
export type Rsvp = 'invited' | 'accepted' | 'declined'

// « Changer attendance_mode, clore l'événement » et « émettre une invitation » sont
// réservés à l'administrateur de l'événement.
export function canManageEvent(role: ParticipantRole): boolean {
  return role === 'admin'
}

// « Trancher le vote d'une activité → administrateur de l'événement ». Sans échéance ni
// quorum : l'administrateur peut retenir une activité minoritaire, le vote informe la
// décision sans la contraindre (§3.3).
export function canDecideActivity(role: ParticipantRole): boolean {
  return role === 'admin'
}

// « Proposer une activité, voter → participant **ayant accepté** ». Être participant ne
// suffit pas : un invité qui n'a pas répondu, ou qui a décliné, ne pèse pas sur un programme
// auquel il ne viendra peut-être pas.
export function canProposeActivity(rsvp: Rsvp): boolean {
  return rsvp === 'accepted'
}

export function canVote(rsvp: Rsvp): boolean {
  return rsvp === 'accepted'
}
