import { describe, expect, it } from 'vitest'
import { canManageEvent } from '../../src/lib/permissions.ts'

describe('canManageEvent', () => {
  it('autorise un administrateur', () => {
    expect(canManageEvent('admin')).toBe(true)
  })

  it('refuse un simple participant', () => {
    expect(canManageEvent('member')).toBe(false)
  })
})
