import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../src/App.vue'
import { useSessionStore } from '../src/stores/session.ts'

const blank = { template: '<div />' }

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function mountShell() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: blank },
      { path: '/login', name: 'login', component: blank },
    ],
  })
  await router.push('/')
  await router.isReady()

  // La cloche ouvre le flux personnel au montage : hors sujet ici.
  const wrapper = mount(App, {
    global: { plugins: [router], stubs: { NotificationBell: true } },
  })

  return { wrapper, router }
}

// La carte de compte, seul accès à la déconnexion jusqu'ici, est masquée sous `md` : sur
// téléphone, il n'existait aucun moyen de quitter sa session.
it('propose la déconnexion sur téléphone, à côté de la cloche', async () => {
  const session = useSessionStore()
  session.user = { id: 'u1', name: 'Théo Gillet', email: 'theo@efrei.net' }
  session.status = 'authenticated'

  const { wrapper } = await mountShell()

  const mobile = wrapper
    .findAll('button[aria-label="Se déconnecter"]')
    .filter((button) => button.classes().includes('md:hidden'))
  expect(mobile).toHaveLength(1)
})

it('déconnecte et renvoie au login depuis le bouton mobile', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  )
  const session = useSessionStore()
  session.user = { id: 'u1', name: 'Théo Gillet', email: 'theo@efrei.net' }
  session.status = 'authenticated'

  const { wrapper, router } = await mountShell()

  const mobile = wrapper
    .findAll('button[aria-label="Se déconnecter"]')
    .find((button) => button.classes().includes('md:hidden'))
  await mobile?.trigger('click')
  await flushPromises()

  expect(session.status).toBe('anonymous')
  expect(router.currentRoute.value.path).toBe('/login')
})

it('ne montre aucun bouton de déconnexion sans session', async () => {
  const { wrapper } = await mountShell()

  expect(wrapper.find('button[aria-label="Se déconnecter"]').exists()).toBe(false)
})
