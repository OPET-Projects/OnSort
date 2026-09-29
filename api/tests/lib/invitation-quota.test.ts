import { beforeEach, expect, it } from 'vitest'
import { ApiError } from '../../src/lib/http.ts'
import {
  consumeInvitationQuota,
  INVITATION_QUOTA,
  resetInvitationQuotas,
} from '../../src/lib/invitation-quota.ts'

const HOUR = 3_600_000

beforeEach(() => {
  resetInvitationQuotas()
})

function exhaust(userId: string, at: number) {
  for (let index = 0; index < INVITATION_QUOTA; index += 1) {
    consumeInvitationQuota(userId, at)
  }
}

it('accepte vingt invitations dans l’heure', () => {
  expect(INVITATION_QUOTA).toBe(20)
  expect(() => exhaust('alice', 0)).not.toThrow()
})

it('refuse la vingt et unième par un 429', () => {
  exhaust('alice', 0)

  let caught: unknown
  try {
    consumeInvitationQuota('alice', 1_000)
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(ApiError)
  expect((caught as ApiError).status).toBe(429)
  expect((caught as ApiError).code).toBe('too_many_invitations')
})

it('dit quand réessayer', () => {
  exhaust('alice', 0)

  try {
    consumeInvitationQuota('alice', 10 * 60_000)
  } catch (error) {
    // La plus ancienne invitation sort de la fenêtre à t = 1 h ; on est à t = 10 min.
    expect((error as ApiError).details).toEqual({ retryAfterSeconds: 50 * 60 })
  }
})

it('rend la place à mesure que la fenêtre glisse', () => {
  exhaust('alice', 0)

  expect(() => consumeInvitationQuota('alice', HOUR)).not.toThrow()
})

it('compte chaque compte à part', () => {
  exhaust('alice', 0)

  expect(() => consumeInvitationQuota('bob', 0)).not.toThrow()
})
