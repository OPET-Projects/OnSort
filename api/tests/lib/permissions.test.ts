import { describe, expect, it } from 'vitest'
import {
  canConfirmSettlement,
  canDecideActivity,
  canDeclareSettlement,
  canManageEvent,
  canProposeActivity,
  canRecordExpense,
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

describe('permissions financières', () => {
  // « Saisir une dépense → participant ayant accepté » (§3.8).
  it("réserve la saisie d'une dépense au participant ayant accepté", () => {
    expect(canRecordExpense('accepted')).toBe(true)
    expect(canRecordExpense('invited')).toBe(false)
    expect(canRecordExpense('declined')).toBe(false)
  })

  // Un administrateur n'y a pas droit non plus : personne ne peut affirmer à la place de
  // quelqu'un d'autre qu'il a payé.
  it('réserve la déclaration au débiteur', () => {
    expect(canDeclareSettlement('p1', 'p1')).toBe(true)
    expect(canDeclareSettlement('p2', 'p1')).toBe(false)
  })

  it('réserve la confirmation au créancier', () => {
    expect(canConfirmSettlement('p2', 'p2')).toBe(true)
    expect(canConfirmSettlement('p1', 'p2')).toBe(false)
  })
})
