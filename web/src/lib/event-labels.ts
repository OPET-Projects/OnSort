// Libellés et tons de l'écran d'un événement, partagés entre l'en-tête, l'onglet
// Participants et la colonne de côté.

export const statusLabel: Record<string, string> = {
  draft: 'Brouillon',
  active: 'En cours',
  closed: 'Clôturé',
}

export const rsvpLabel: Record<string, string> = {
  invited: 'À confirmer',
  accepted: 'Participe',
  declined: 'Décline',
}

// Les mêmes trois tons que sur le tableau de bord : un état se reconnaît à sa couleur d'un
// écran à l'autre.
export const statusTone: Record<string, string> = {
  draft: 'bg-fill text-muted',
  active: 'bg-accent-soft text-accent',
  closed: 'bg-fill text-muted',
}

export const rsvpTone: Record<string, string> = {
  invited: 'bg-wait text-wait-ink',
  accepted: 'bg-free text-free-ink',
  declined: 'bg-fail text-fail-ink',
}
