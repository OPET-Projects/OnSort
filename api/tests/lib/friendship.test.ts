import { expect, it } from 'vitest'
import { normalisePair, otherSide } from '../../src/lib/friendship.ts'

// L'ordre des arguments ne doit rien changer : c'est toute la raison d'être de la
// normalisation. Sans elle, une amitié écrite dans un sens ne se lirait pas dans l'autre.
it('rend le même couple quel que soit l’ordre des arguments', () => {
  expect(normalisePair('bbb', 'aaa')).toEqual(normalisePair('aaa', 'bbb'))
})

it('range le plus petit identifiant en premier', () => {
  expect(normalisePair('bbb', 'aaa')).toEqual({ userAId: 'aaa', userBId: 'bbb' })
})

it('refuse un couple identique', () => {
  expect(() => normalisePair('aaa', 'aaa')).toThrow()
})

it('rend l’autre membre du couple', () => {
  const pair = normalisePair('aaa', 'bbb')

  expect(otherSide(pair, 'aaa')).toBe('bbb')
  expect(otherSide(pair, 'bbb')).toBe('aaa')
})

it('refuse de désigner l’autre pour quelqu’un d’étranger au couple', () => {
  expect(() => otherSide(normalisePair('aaa', 'bbb'), 'ccc')).toThrow()
})
