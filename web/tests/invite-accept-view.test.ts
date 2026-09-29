import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useSessionStore } from '../src/stores/session.ts'
import InviteAcceptView from '../src/views/InviteAcceptView.vue'

// La logique vit dans `useInvite` (tests/invite.test.ts) ; ici, ce que l'écran montre.

const blank = { template: '<div />' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const eventPreview = {
  scope: 'event',
  eventId: 'e1',
  title: 'Week-end à Lyon',
  startsAt: '2026-10-01T18:00:00.000Z',
  endsAt: '2026-10-03T22:00:00.000Z',
  organiser: 'Alice',
  participantCount: 4,
  alreadyMember: false,
}

const groupPreview = {
  scope: 'group',
  groupId: 'g1',
  title: 'Les copains du jeudi',
  organiser: 'Alice',
  participantCount: 1,
  alreadyMember: false,
}

beforeEach(() => {
  setActivePinia(createPinia())
  useSessionStore().$patch({
    status: 'authenticated',
    user: { id: 'u1', email: 'bob@example.test', name: 'Bob' },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function open(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/invite/:token', component: InviteAcceptView },
      { path: '/', name: 'home', component: blank },
      { path: '/login', name: 'login', component: blank },
      { path: '/events/:id', component: blank },
      { path: '/groups/:id', component: blank },
    ],
  })
  await router.push('/invite/tok')
  await router.isReady()
  const wrapper = mount(InviteAcceptView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const buttonLabels = (wrapper: Awaited<ReturnType<typeof open>>) =>
  wrapper.findAll('[role="dialog"] button').map((button) => button.text())

it('propose les trois réponses d’une sortie', async () => {
  const wrapper = await open(json(eventPreview))

  expect(wrapper.text()).toContain('Alice vous invite')
  expect(wrapper.text()).toContain('Week-end à Lyon')
  expect(wrapper.text()).toContain('4 personnes y sont déjà')
  expect(buttonLabels(wrapper)).toEqual(['Je participe', 'Je ne sais pas encore', 'Je ne peux pas'])
  wrapper.unmount()
})

// Un groupe n'a pas de RSVP : « Je ne sais pas » n'aurait rien à enregistrer.
it('n’en propose que deux pour un groupe', async () => {
  const wrapper = await open(json(groupPreview))

  expect(wrapper.text()).toContain('Alice vous invite dans un groupe')
  expect(wrapper.text()).toContain('1 personne y est déjà')
  expect(buttonLabels(wrapper)).toEqual(['Rejoindre le groupe', 'Non merci'])
  wrapper.unmount()
})

it('place le focus sur le bouton d’entrée', async () => {
  const wrapper = await open(json(eventPreview))

  expect(document.activeElement?.textContent?.trim()).toBe('Je participe')
  wrapper.unmount()
})

it('affiche le message d’une invitation invalide et un retour', async () => {
  const wrapper = await open(
    json({ code: 'invalid_invitation', message: 'Cette invitation a expiré.', details: {} }, 404),
  )

  expect(wrapper.text()).toContain('Cette invitation a expiré.')
  expect(wrapper.find('a[href="/"]').text()).toContain('Retour au tableau de bord')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  wrapper.unmount()
})
