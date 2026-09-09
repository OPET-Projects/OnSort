import { describe, expect, it } from 'vitest'
import { generateInviteToken, hashInviteToken } from '../../src/lib/tokens.ts'

describe('generateInviteToken', () => {
  it('produit une valeur URL-sûre et longue à chaque appel', () => {
    const a = generateInviteToken()
    const b = generateInviteToken()

    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(40)
    expect(a).not.toMatch(/[+/=]/)
  })
})

describe('hashInviteToken', () => {
  it('est stable et masque le jeton', () => {
    const raw = generateInviteToken()

    expect(hashInviteToken(raw)).toBe(hashInviteToken(raw))
    expect(hashInviteToken(raw)).not.toBe(raw)
  })

  it('sépare deux jetons distincts', () => {
    expect(hashInviteToken(generateInviteToken())).not.toBe(hashInviteToken(generateInviteToken()))
  })
})
