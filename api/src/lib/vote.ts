// Décompte d'un vote d'activité (conception §3.3). Fonction pure, sans entrées-sorties :
// c'est là que porte l'effort de test.
//
// Ne pas voter est une **abstention** : le décompte ne totalise que les voix déposées,
// jamais les participants silencieux. Un changement d'avis ne produit pas une seconde voix —
// la clé primaire `(activity_id, participant_id)` de la conception §2.7 remplace la ligne,
// si bien que cette fonction ne reçoit jamais deux votes d'un même participant.

export type VoteValue = 'for' | 'against'

export type Tally = {
  for: number
  against: number
}

export function tally(votes: readonly { value: VoteValue }[]): Tally {
  let inFavour = 0
  let against = 0

  for (const vote of votes) {
    if (vote.value === 'for') {
      inFavour += 1
    } else {
      against += 1
    }
  }

  return { for: inFavour, against }
}
