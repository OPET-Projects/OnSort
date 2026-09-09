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

const previewBody = {
  eventId: 'e1',
  title: 'Week-end à Lyon',
  startsAt: '2026-10-01T18:00:00.000Z',
  endsAt: '2026-10-03T22:00:00.000Z',
  organiser: 'Alice',
  participantCount: 4,
  alreadyMember: false,
}

const navSpies = () => ({ toLogin: vi.fn(), toEvent: vi.fn(), toHome: vi.fn() })

const signedIn = () =>
  useSessionStore().$patch({
    status: 'authenticated',
    user: { id: 'u1', email: 'a@b.c', name: 'A' },
  })

it('renvoie vers la connexion quand la session est anonyme', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json(null, 401)),
  )
  const nav = navSpies()

  const { load } = useInvite('tok', nav)
  await load()

  expect(nav.toLogin).toHaveBeenCalled()
  expect(nav.toEvent).not.toHaveBeenCalled()
})

// L'aperçu précède la décision : ouvrir le lien ne fait plus rejoindre.
it("charge l'aperçu sans rien accepter", async () => {
  signedIn()
  const fetchMock = vi.fn(async () => json(previewBody))
  vi.stubGlobal('fetch', fetchMock)
  const nav = navSpies()

  const { state, preview, load } = useInvite('tok', nav)
  await load()

  expect(state.value).toBe('ready')
  expect(preview.value?.title).toBe('Week-end à Lyon')
  expect(preview.value?.organiser).toBe('Alice')
  expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
  expect(nav.toEvent).not.toHaveBeenCalled()
})

// Rouvrir son propre lien une fois entré ne doit pas reposer la question.
it("ouvre directement l'événement quand on en est déjà membre", async () => {
  signedIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ ...previewBody, alreadyMember: true })),
  )
  const nav = navSpies()

  const { load } = useInvite('tok', nav)
  await load()

  expect(nav.toEvent).toHaveBeenCalledWith('e1')
})

it("accepte l'invitation et redirige vers l'événement", async () => {
  signedIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ eventId: 'e1' }) : json(previewBody),
    ),
  )
  const nav = navSpies()

  const { load, accept } = useInvite('tok', nav)
  await load()
  await accept()

  expect(nav.toEvent).toHaveBeenCalledWith('e1')
})

// « Non merci » n'écrit rien : le lien reste utilisable si l'invité change d'avis.
it("renvoie à l'accueil sans rien envoyer quand on refuse", async () => {
  signedIn()
  const fetchMock = vi.fn(async () => json(previewBody))
  vi.stubGlobal('fetch', fetchMock)
  const nav = navSpies()

  const { load, decline } = useInvite('tok', nav)
  await load()

  const callsBefore = fetchMock.mock.calls.length
  decline()

  expect(nav.toHome).toHaveBeenCalled()
  expect(fetchMock.mock.calls).toHaveLength(callsBefore)
})

it("affiche un message quand l'invitation n'est plus valide", async () => {
  signedIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'invitation_not_found', message: 'x', details: {} }, 404)),
  )
  const nav = navSpies()

  const { state, message, load } = useInvite('tok', nav)
  await load()

  expect(state.value).toBe('error')
  expect(message.value).toBe("Cette invitation n'est plus valide.")
})

it('explique un lien révoqué', async () => {
  signedIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'invitation_link_revoked', message: 'x', details: {} }, 410)),
  )
  const nav = navSpies()

  const { state, message, load } = useInvite('tok', nav)
  await load()

  expect(state.value).toBe('error')
  expect(message.value).toBe("Ce lien d'invitation n'est plus actif.")
})

it("explique une invitation adressée à quelqu'un d'autre", async () => {
  signedIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'invitation_not_yours', message: 'x', details: {} }, 403)),
  )
  const nav = navSpies()

  const { state, message, load } = useInvite('tok', nav)
  await load()

  expect(state.value).toBe('error')
  expect(message.value).toBe('Cette invitation est adressée à une autre personne.')
})

it('signale un échec survenu au moment de rejoindre', async () => {
  signedIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? json({ code: 'invitation_not_found', message: 'x', details: {} }, 404)
        : json(previewBody),
    ),
  )
  const nav = navSpies()

  const { state, message, load, accept } = useInvite('tok', nav)
  await load()
  await accept()

  expect(state.value).toBe('error')
  expect(message.value).toBe("Cette invitation n'est plus valide.")
  expect(nav.toEvent).not.toHaveBeenCalled()
})
