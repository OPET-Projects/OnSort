// Normalisation du couple d'une amitié (conception §2.2). Fonction pure, sans
// entrées-sorties.
//
// La contrainte `user_a_id < user_b_id` posée en base garantit qu'une amitié occupe une
// seule ligne. Cette normalisation est appelée à l'écriture **et** à la lecture : deux
// implémentations de la même règle finiraient par diverger, et une amitié écrite dans un
// sens ne se lirait plus dans l'autre.

export type Pair = {
  userAId: string
  userBId: string
}

export function normalisePair(first: string, second: string): Pair {
  if (first === second) {
    throw new Error('Une amitié lie deux personnes distinctes.')
  }

  return first < second ? { userAId: first, userBId: second } : { userAId: second, userBId: first }
}

// L'ami de quelqu'un, dans un couple déjà normalisé. Lever plutôt que rendre une valeur par
// défaut : demander « qui est l'autre » pour un tiers est un défaut d'appel, pas un cas
// limite à absorber en silence.
export function otherSide(pair: Pair, viewerId: string): string {
  if (viewerId === pair.userAId) {
    return pair.userBId
  }

  if (viewerId === pair.userBId) {
    return pair.userAId
  }

  throw new Error(`${viewerId} ne fait pas partie de ce couple.`)
}
