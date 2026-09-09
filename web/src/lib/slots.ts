// Affichage d'un créneau, pour l'œil humain. Les bornes restent semi-ouvertes côté API :
// « du 1er au 3 » y signifie que le 3 n'est pas compris, ce que le texte ne cherche pas à
// rendre — il montre les deux instants, l'utilisateur lit une plage.
const dayTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const dayOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
const timeOnly = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' })

export function formatSlot(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)

  if (start.toDateString() === end.toDateString()) {
    return `${dayOnly.format(start)}, de ${timeOnly.format(start)} à ${timeOnly.format(end)}`
  }

  return `du ${dayTime.format(start)} au ${dayTime.format(end)}`
}

// Durée lisible d'un créneau. Sans elle, comparer « du 3 au 5 » et « du 8 au 11 » demande un
// calcul mental à chaque ligne.
export function formatDuration(startsAt: string, endsAt: string): string {
  const minutes = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  if (days > 0 && hours > 0) return `${days} j ${hours} h`
  if (days > 0) return `${days} j`
  if (hours > 0) return `${hours} h`
  return `${minutes} min`
}
