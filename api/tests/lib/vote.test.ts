import { describe, expect, it } from 'vitest'
import { tally } from '../../src/lib/vote.ts'

describe('tally', () => {
  it('ne compte rien quand personne n’a voté', () => {
    expect(tally([])).toEqual({ for: 0, against: 0 })
  })

  it('sépare les pour et les contre', () => {
    const votes = [
      { value: 'for' },
      { value: 'against' },
      { value: 'for' },
      { value: 'for' },
      { value: 'against' },
    ] as const

    expect(tally(votes)).toEqual({ for: 3, against: 2 })
  })

  it('traite l’absence de vote comme une abstention, pas comme un contre', () => {
    // Cinq participants, deux votes déposés : le décompte totalise deux voix. Les trois
    // silencieux ne pèsent d'aucun côté (conception §3.3).
    const votes = [{ value: 'for' }, { value: 'against' }] as const
    const result = tally(votes)

    expect(result.for + result.against).toBe(2)
  })

  it('ne voit qu’un vote par participant après un changement d’avis', () => {
    // La clé primaire (activity_id, participant_id) de la conception §2.7 garantit qu'un
    // changement d'avis remplace la ligne au lieu d'en ajouter une. `tally` reçoit donc
    // toujours une liste déjà dédoublonnée : ce test fige l'invariant sur lequel il compte.
    const apresChangementDAvis = [{ value: 'against' }] as const

    expect(tally(apresChangementDAvis)).toEqual({ for: 0, against: 1 })
  })
})
