import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useInvite } from '../src/composables/useInvite.ts'
import { useSessionStore } from '../src/stores/session.ts'

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

it('renvoie vers la connexion quand la session est anonyme', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json(null, 401)),
  )
  const toLogin = vi.fn()
  const toEvent = vi.fn()

  const { run } = useInvite('tok', { toLogin, toEvent })
  await run()

  expect(toLogin).toHaveBeenCalled()
  expect(toEvent).not.toHaveBeenCalled()
})

it('accepte l’invitation et redirige vers l’événement', async () => {
  useSessionStore().$patch({
    status: 'authenticated',
    user: { id: 'u1', email: 'a@b.c', name: 'A' },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ eventId: 'e1' })),
  )
  const toEvent = vi.fn()

  const { run } = useInvite('tok', { toLogin: vi.fn(), toEvent })
  await run()

  expect(toEvent).toHaveBeenCalledWith('e1')
})

it('affiche un message quand l’invitation n’est plus valide', async () => {
  useSessionStore().$patch({
    status: 'authenticated',
    user: { id: 'u1', email: 'a@b.c', name: 'A' },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'invitation_not_found', message: 'x', details: {} }, 404)),
  )

  const { state, message, run } = useInvite('tok', { toLogin: vi.fn(), toEvent: vi.fn() })
  await run()

  expect(state.value).toBe('error')
  expect(message.value).toBe("Cette invitation n'est plus valide.")
})
