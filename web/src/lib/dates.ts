const formatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'full',
  timeStyle: 'short',
})

// Instant ISO → texte lisible en français. Une période d'un seul jour n'affiche la date
// qu'une fois.
export function formatPeriod(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const sameDay = start.toDateString() === end.toDateString()

  if (sameDay) {
    const day = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(start)
    const from = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(start)
    const to = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(end)
    return `${day}, de ${from} à ${to}`
  }

  return `du ${formatter.format(start)} au ${formatter.format(end)}`
}

// Valeur d'un <input type="datetime-local"> (heure locale, sans fuseau) → ISO 8601 UTC.
export function localInputToIso(value: string): string {
  return new Date(value).toISOString()
}

// Inverse de `localInputToIso` : ISO 8601 → valeur d'un <input type="datetime-local">, en
// heure locale. `toISOString` rendrait l'heure UTC, décalée d'autant que le fuseau.
export function isoToLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
