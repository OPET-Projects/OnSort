import { afterEach, expect, it, vi } from 'vitest'
import { useEvent } from '../src/composables/useEvent.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const detail = {
  id: 'e1',
  title: 'Sortie',
  description: '',
  startsAt: '2026-10-01T18:00:00.000Z',
  endsAt: '2026-10-01T22:00:00.000Z',
  status: 'draft',
  createdBy: 'u1',
  participants: [],
  viewer: { participantId: 'p1', role: 'member', rsvp: 'invited' },
}

it('charge l’événement', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ event: detail })),
  )

  const { state, event, refresh } = useEvent('e1')
  await refresh()

  expect(state.value).toBe('ready')
  expect(event.value?.title).toBe('Sortie')
})

it('signale un accès refusé avec un message dédié', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'not_a_participant', message: 'x', details: {} }, 403)),
  )

  const { state, error, refresh } = useEvent('e1')
  await refresh()

  expect(state.value).toBe('error')
  expect(error.value).toBe('Vous ne participez pas à cet événement.')
})

it('poste le RSVP puis recharge', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return json({ ok: true })
    return json({
      event: { ...detail, viewer: { participantId: 'p1', role: 'member', rsvp: 'accepted' } },
    })
  })
  vi.stubGlobal('fetch', fetchMock)

  const { event, setRsvp } = useEvent('e1')
  await setRsvp('accepted')

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/events/e1/rsvp',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(event.value?.viewer.rsvp).toBe('accepted')
})
