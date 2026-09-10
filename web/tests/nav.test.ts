import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppNav from '../src/components/AppNav.vue'
import { useSessionStore } from '../src/stores/session.ts'

const blank = { template: '<div />' }

const routes = [
  { path: '/', component: blank },
  { path: '/events/:id', component: blank },
  { path: '/groups', component: blank },
  { path: '/groups/:id', component: blank },
  { path: '/me/calendar', component: blank },
  { path: '/friends', component: blank },
]

beforeEach(() => {
  setActivePinia(createPinia())
})

async function navigateTo(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()

  return mount(AppNav, { global: { plugins: [router] } })
}

// La barre latérale et la barre basse rendent la même liste : un onglet actif apparaît donc
// deux fois, une occurrence par largeur d'écran.
it("garde l'onglet Sorties allumé sur le tableau de bord", async () => {
  const wrapper = await navigateTo('/')

  const active = wrapper.findAll('a.text-accent, a.bg-accent-soft')
  expect(active).toHaveLength(2)
  expect(active[0]?.text()).toBe('Sorties')
  expect(active[1]?.text()).toBe('Sorties')
})

// Ouvrir un événement ne quitte pas les sorties : sans cette correspondance, l'utilisateur
// perdrait sa position dans la barre dès qu'il entre dans un écran de détail.
it("garde l'onglet Sorties allumé sur un événement", async () => {
  const wrapper = await navigateTo('/events/e1')

  expect(wrapper.findAll('a.bg-accent-soft')[0]?.text()).toBe('Sorties')
})

it('allume Groupes sur le détail d’un groupe', async () => {
  const wrapper = await navigateTo('/groups/g1')

  expect(wrapper.findAll('a.bg-accent-soft')[0]?.text()).toBe('Groupes')
})

it('allume Calendrier sur les indisponibilités', async () => {
  const wrapper = await navigateTo('/me/calendar')

  expect(wrapper.findAll('a.bg-accent-soft')[0]?.text()).toBe('Calendrier')
})

it('allume Amis sur la liste d’amis', async () => {
  const wrapper = await navigateTo('/friends')

  expect(wrapper.findAll('a.bg-accent-soft')[0]?.text()).toBe('Amis')
})

it('réduit le nom de la session à deux initiales', async () => {
  const session = useSessionStore()
  session.user = { id: 'u1', name: 'Théo Gillet', email: 'theo@efrei.net' }

  const wrapper = await navigateTo('/')

  expect(wrapper.text()).toContain('TG')
  expect(wrapper.text()).toContain('theo@efrei.net')
})
