// Les centimes ne deviennent des euros qu'ici, au dernier moment, pour l'œil humain. Aucun
// calcul du domaine ne porte sur le résultat : côté API, l'argent reste entier.

const formatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

export function formatCents(amountCents: number): string {
  return formatter.format(amountCents / 100)
}

// Euros saisis à la main → centimes entiers. La virgule décimale française est acceptée
// telle quelle : c'est ce que les gens tapent.
//
// `Math.round` et non `Math.trunc` : « 10,99 » vaut 1098.9999… en flottant, et tronquer
// perdrait un centime à chaque dépense. Une saisie illisible rend `NaN`, que l'appelant
// refuse — la valider ici, sans contexte, obligerait à inventer un message d'erreur.
export function parseEurosToCents(value: string): number {
  const normalized = value.trim().replace(',', '.')

  if (normalized === '') {
    return Number.NaN
  }

  return Math.round(Number(normalized) * 100)
}
