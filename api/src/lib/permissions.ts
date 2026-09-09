// Matrice des permissions de la conception §3.8, restreinte à ce que M1 met en jeu :
// modifier la configuration d'un événement et émettre une invitation. Le rôle est passé
// en union locale plutôt qu'importé du client Prisma généré : garder `lib/` sans
// dépendance au code généré.
export type ParticipantRole = 'admin' | 'member'

// « Changer attendance_mode, clore l'événement » et « émettre une invitation » sont
// réservés à l'administrateur de l'événement.
export function canManageEvent(role: ParticipantRole): boolean {
  return role === 'admin'
}
