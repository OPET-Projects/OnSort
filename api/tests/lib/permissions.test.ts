import { describe, expect, it } from 'vitest'
import {
  canDecideActivity,
  canManageEvent,
  canProposeActivity,
  canVote,
} from '../../src/lib/permissions.ts'

describe('canManageEvent', () => {
  it('autorise un administrateur', () => {
    expect(canManageEvent('admin')).toBe(true)
  })

  it('refuse un simple participant', () => {
    expect(canManageEvent('member')).toBe(false)
  })
})

describe('canDecideActivity', () => {
  it('réserve la décision à un administrateur', () => {
    expect(canDecideActivity('admin')).toBe(true)
    expect(canDecideActivity('member')).toBe(false)
  })
})

// Conception §3.8 : « Proposer une activité, voter → participant ayant accepté ». Être
// participant ne suffit donc pas — c'est le piège de la ligne, et la matrice est écrite en
// entier pour qu'un oubli se voie.
describe('canProposeActivity', () => {
  it('exige d’avoir accepté l’événement', () => {
    expect(canProposeActivity('accepted')).toBe(true)
    expect(canProposeActivity('invited')).toBe(false)
    expect(canProposeActivity('declined')).toBe(false)
  })
})

describe('canVote', () => {
  it('exige d’avoir accepté l’événement', () => {
    expect(canVote('accepted')).toBe(true)
    expect(canVote('invited')).toBe(false)
    expect(canVote('declined')).toBe(false)
  })
})
