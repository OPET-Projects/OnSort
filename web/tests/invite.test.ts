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
  scope: 'event',
  eventId: 'e1',
  title: 'Week-end à Lyon',
  startsAt: '2026-10-01T18:00:00.000Z',
  endsAt: '2026-10-03T22:00:00.000Z',
  organiser: 'Alice',
  participantCount: 4,
  alreadyMember: false,
}

const navSpies = () => ({
  toLogin: vi.fn(),
  toEvent: vi.fn(),
  toGroup: vi.fn(),
  toHome: vi.fn(),
})

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

// Les trois réponses font entrer dans l'événement : décliner sans laisser de ligne serait
// indistinguable de n'avoir jamais ouvert le lien.
it.each([['accepted'], ['invited']] as const)(
  'transmet la réponse %s puis ouvre l’événement',
  async (rsvp) => {
    signedIn()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ eventId: 'e1' }) : json(previewBody),
    )
    vi.stubGlobal('fetch', fetchMock)
    const nav = navSpies()

    const { load, respond } = useInvite('tok', nav)
    await load()
    await respond(rsvp)

    const sent = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]
    expect(JSON.parse(String(sent?.body))).toEqual({ rsvp })
    expect(nav.toEvent).toHaveBeenCalledWith('e1')
  },
)

// Refuser enregistre la réponse mais renvoie à l'accueil : ouvrir l'événement qu'on vient
// de décliner serait contradictoire.
it('enregistre un refus et renvoie à l’accueil', async () => {
  signedIn()
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? json({ eventId: 'e1' }) : json(previewBody),
  )
  vi.stubGlobal('fetch', fetchMock)
  const nav = navSpies()

  const { load, respond } = useInvite('tok', nav)
  await load()
  await respond('declined')

  const sent = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]
  expect(JSON.parse(String(sent?.body))).toEqual({ rsvp: 'declined' })
  expect(nav.toHome).toHaveBeenCalled()
  expect(nav.toEvent).not.toHaveBeenCalled()
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

  const { state, message, load, respond } = useInvite('tok', nav)
  await load()
  await respond('accepted')

  expect(state.value).toBe('error')
  expect(message.value).toBe("Cette invitation n'est plus valide.")
  expect(nav.toEvent).not.toHaveBeenCalled()
})

// Une invitation de groupe n'a ni dates ni RSVP : on en est membre ou non, et l'acceptation
// ouvre le groupe.
it('ouvre le groupe sur une invitation de groupe', async () => {
  signedIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? json({ groupId: 'g1' })
        : json({
            scope: 'group',
            groupId: 'g1',
            title: 'Les copains',
            organiser: 'Alice',
            participantCount: 3,
            alreadyMember: false,
          }),
    ),
  )
  const nav = navSpies()

  const { load, preview, respond } = useInvite('tok', nav)
  await load()

  expect(preview.value?.scope).toBe('group')

  await respond('accepted')

  expect(nav.toGroup).toHaveBeenCalledWith('g1')
  expect(nav.toEvent).not.toHaveBeenCalled()
})

it('ouvre directement le groupe quand on en est déjà membre', async () => {
  signedIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({
        scope: 'group',
        groupId: 'g1',
        title: 'Les copains',
        organiser: 'Alice',
        participantCount: 3,
        alreadyMember: true,
      }),
    ),
  )
  const nav = navSpies()

  const { load } = useInvite('tok', nav)
  await load()

  expect(nav.toGroup).toHaveBeenCalledWith('g1')
})
