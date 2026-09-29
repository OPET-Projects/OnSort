import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import EventCreateView from '../src/views/EventCreateView.vue'

const blank = { template: '<div />' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const groups = [{ id: 'g1', name: 'Les copains', role: 'admin', memberCount: 3 }]

type Call = { url: string; body: unknown }

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// `/api/groups` alimente le sélecteur ; `/api/events` rend ce que le test demande.
function stubApi(createResponse: Response) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      return url === '/api/groups' ? json({ groups }) : createResponse
    }),
  )
  return calls
}

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/events/new', component: EventCreateView },
      { path: '/events/:id', component: blank },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(EventCreateView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

async function fillAndSubmit(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper']) {
  await wrapper.get('input[type="text"]').setValue('Raclette chez Paul')
  const [start, end] = wrapper.findAll('input[type="datetime-local"]')
  await start?.setValue('2026-10-01T18:00')
  await end?.setValue('2026-10-01T23:30')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

it('crée la sortie puis ouvre sa page', async () => {
  const calls = stubApi(json({ id: 'e42' }, 201))
  const { wrapper, router } = await mountAt('/events/new')

  await fillAndSubmit(wrapper)

  const created = calls.find((call) => call.url === '/api/events')
  expect(created?.body).toMatchObject({
    title: 'Raclette chez Paul',
    startsAt: new Date('2026-10-01T18:00').toISOString(),
    endsAt: new Date('2026-10-01T23:30').toISOString(),
  })
  expect(router.currentRoute.value.path).toBe('/events/e42')
})

it('signale une période inversée sous les dates', async () => {
  stubApi(json({ code: 'invalid_period', message: 'Période invalide', details: {} }, 400))
  const { wrapper, router } = await mountAt('/events/new')

  await fillAndSubmit(wrapper)

  expect(wrapper.text()).toContain('La fin doit être postérieure au début.')
  expect(router.currentRoute.value.path).toBe('/events/new')
})

it('dit qu’on ne fait pas partie du groupe visé', async () => {
  stubApi(json({ code: 'not_a_member', message: 'Refusé', details: {} }, 403))
  const { wrapper } = await mountAt('/events/new?group=g1')

  await fillAndSubmit(wrapper)

  expect(wrapper.text()).toContain('Vous ne faites pas partie de ce groupe')
})

it('fixe le groupe venu du lien, sans sélecteur', async () => {
  const calls = stubApi(json({ id: 'e1' }, 201))
  const { wrapper } = await mountAt('/events/new?group=g1')

  expect(wrapper.text()).toContain('Les copains')
  expect(wrapper.find('select').exists()).toBe(false)

  await fillAndSubmit(wrapper)

  expect(calls.find((call) => call.url === '/api/events')?.body).toMatchObject({ groupId: 'g1' })
})

it('propose ses groupes quand aucun n’est imposé', async () => {
  stubApi(json({ id: 'e1' }, 201))
  const { wrapper } = await mountAt('/events/new')

  const options = wrapper.findAll('select option').map((option) => option.text())

  expect(options).toEqual(['Aucun (sortie ad hoc)', 'Les copains'])
})

it('pré-remplit les dates d’un créneau libre', async () => {
  stubApi(json({ id: 'e1' }, 201))
  const startsAt = '2026-10-04T08:00:00.000Z'
  const endsAt = '2026-10-04T12:00:00.000Z'
  const { wrapper } = await mountAt(
    `/events/new?group=g1&startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}`,
  )

  const start = wrapper.get<HTMLInputElement>('input[type="datetime-local"]')

  expect(new Date(start.element.value).toISOString()).toBe(startsAt)
})
