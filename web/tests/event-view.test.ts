import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import EventView from '../src/views/EventView.vue'

// Écran d'un événement, vu de l'extérieur : ce que chaque onglet montre et ce que chaque
// geste envoie à l'API. Écrit avant le découpage du fichier en composants, pour que le
// découpage ne puisse rien changer sans qu'un test le dise.

vi.mock('../src/lib/clipboard', () => ({ copyToClipboard: vi.fn(async () => true) }))

const blank = { template: '<div />' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const participants = [
  {
    participantId: 'p1',
    userId: 'u1',
    name: 'Alice Martin',
    email: 'alice@example.test',
    role: 'admin',
    rsvp: 'accepted',
    joinedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    participantId: 'p2',
    userId: 'u2',
    name: 'Bob Durand',
    email: 'bob@example.test',
    role: 'member',
    rsvp: 'accepted',
    joinedAt: '2026-09-01T10:00:00.000Z',
  },
]

function eventBody(viewerRsvp = 'accepted', viewerRole = 'admin') {
  return {
    event: {
      id: 'e1',
      title: 'Week-end à Lyon',
      description: 'On part vendredi.',
      startsAt: '2026-10-02T16:00:00.000Z',
      endsAt: '2026-10-04T20:00:00.000Z',
      status: 'active',
      createdBy: 'u1',
      group: null,
      participants,
      pendingInvitations: [{ id: 'i1', email: 'carla@example.test', createdAt: '2026-09-02' }],
      viewer: { participantId: 'p1', role: viewerRole, rsvp: viewerRsvp },
    },
  }
}

const activity = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title,
  kind: 'other',
  address: '',
  startsAt: null,
  endsAt: null,
  lat: null,
  lng: null,
  position: 0,
  status: 'proposed',
  cancelledAt: null,
  proposedBy: { participantId: 'p1', name: 'Alice Martin' },
  tally: { for: 1, against: 0 },
  myVote: null,
  ...overrides,
})

const activities = [
  activity('a1', 'Musée des Confluences', {
    status: 'accepted',
    lat: 45.73,
    lng: 4.82,
    position: 1,
  }),
  activity('a2', 'Bouchon lyonnais', { position: 2 }),
]

const expensesBody = {
  expenses: [
    {
      id: 'x1',
      label: 'Train aller',
      amountCents: 9000,
      currency: 'EUR',
      activityId: null,
      splitMode: 'equal',
      createdAt: '2026-09-03T10:00:00.000Z',
      paidBy: { participantId: 'p1', name: 'Alice Martin' },
      shares: [
        { participantId: 'p1', amountCents: 4500 },
        { participantId: 'p2', amountCents: 4500 },
      ],
    },
  ],
}

const balancesBody = {
  balances: [
    { participantId: 'p1', name: 'Alice Martin', balanceCents: 4500, you: true },
    { participantId: 'p2', name: 'Bob Durand', balanceCents: -4500, you: false },
  ],
  transfers: [
    {
      fromParticipantId: 'p2',
      toParticipantId: 'p1',
      fromName: 'Bob Durand',
      toName: 'Alice Martin',
      amountCents: 4500,
    },
  ],
  pendingSettlements: [],
}

type Call = { method: string; url: string; body: unknown }

let calls: Call[]

function stubApi(viewerRsvp = 'accepted', viewerRole = 'admin') {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({
        method,
        url,
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      if (method === 'GET' && url === '/api/events/e1')
        return json(eventBody(viewerRsvp, viewerRole))
      if (method === 'GET' && url === '/api/events/e1/activities') return json({ activities })
      if (method === 'GET' && url === '/api/events/e1/expenses') return json(expensesBody)
      if (method === 'GET' && url === '/api/events/e1/balances') return json(balancesBody)
      if (url === '/api/map/config') {
        return json({
          tilesUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: 'OSM',
        })
      }
      if (url.endsWith('/vote')) return json({ for: 2, against: 0 })
      if (method === 'POST' && url === '/api/events/e1/invitations') {
        return json({ url: 'https://onsort.test/invite/tok' })
      }
      return json({})
    }),
  )
}

class FakeEventSource {
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function open() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/events/:id', component: EventView },
      { path: '/groups/:id', component: blank },
    ],
  })
  await router.push('/events/e1')
  await router.isReady()
  const wrapper = mount(EventView, {
    global: { plugins: [router], stubs: { MapView: true } },
  })
  await flushPromises()
  return wrapper
}

async function showTab(wrapper: Awaited<ReturnType<typeof open>>, label: string) {
  const tab = wrapper.findAll('nav button').find((button) => button.text() === label)
  await tab?.trigger('click')
  await flushPromises()
}

const sent = (method: string, url: string) =>
  calls.filter((call) => call.method === method && call.url === url)

it('montre l’en-tête et les quatre onglets', async () => {
  stubApi()
  const wrapper = await open()

  expect(wrapper.find('h1').text()).toBe('Week-end à Lyon')
  expect(wrapper.text()).toContain('En cours')
  expect(wrapper.text()).toContain('On part vendredi.')
  expect(wrapper.findAll('nav button').map((button) => button.text())).toEqual([
    'Programme',
    'Participants',
    'Dépenses',
    'Carte',
  ])
})

it('ouvre sur le programme et le propose à qui a accepté', async () => {
  stubApi()
  const wrapper = await open()

  expect(wrapper.text()).toContain('Musée des Confluences')
  expect(wrapper.text()).toContain('Bouchon lyonnais')
  expect(wrapper.text()).toContain('Proposer une activité')
})

it('envoie une proposition', async () => {
  stubApi()
  const wrapper = await open()

  await wrapper.get('input[aria-label="Nom de l\'activité"]').setValue('Balade sur les quais')
  await wrapper.findAll('form').at(0)?.trigger('submit')
  await flushPromises()

  expect(sent('POST', '/api/events/e1/activities')[0]?.body).toMatchObject({
    title: 'Balade sur les quais',
  })
})

it('envoie un vote', async () => {
  stubApi()
  const wrapper = await open()

  // Le premier « Pour » appartient à l'activité déjà retenue, dont le vote est clos.
  const pour = wrapper
    .findAll('button')
    .filter((button) => button.text().startsWith('Pour'))
    .find((button) => !(button.element as HTMLButtonElement).disabled)
  await pour?.trigger('click')
  await flushPromises()

  expect(sent('POST', '/api/activities/a2/vote')).toHaveLength(1)
})

it('explique pourquoi on ne peut pas proposer sans avoir accepté', async () => {
  stubApi('invited', 'member')
  const wrapper = await open()

  expect(wrapper.text()).toContain("Acceptez l'événement pour proposer une activité et voter.")
  expect(wrapper.text()).not.toContain('Proposer une activité')
})

it('liste les dépenses et les soldes', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Dépenses')

  expect(wrapper.text()).toContain('Train aller')
  expect(wrapper.text()).toContain('Bob Durand')
})

it('saisit une dépense à parts égales, en centimes', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Dépenses')

  await wrapper.get('input[aria-label="Objet de la dépense"]').setValue('Restaurant')
  await wrapper.get('input[aria-label="Montant en euros"]').setValue('12,50')
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  expect(sent('POST', '/api/events/e1/expenses')[0]?.body).toMatchObject({
    label: 'Restaurant',
    amountCents: 1250,
  })
})

it('refuse des pourcentages qui ne font pas 100, et dit ce qui manque', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Dépenses')

  await wrapper.get('input[aria-label="Objet de la dépense"]').setValue('Restaurant')
  await wrapper.get('input[aria-label="Montant en euros"]').setValue('100')
  await wrapper.get('select[aria-label="Mode de partage"]').setValue('percent')
  const shares = wrapper.findAll('form label input')
  await shares.at(0)?.setValue('50')
  await shares.at(1)?.setValue('40')

  expect(wrapper.text()).toContain('il manque 10 %')

  await wrapper.get('form').trigger('submit')
  await flushPromises()

  expect(wrapper.text()).toContain('Les pourcentages doivent totaliser 100.')
  expect(sent('POST', '/api/events/e1/expenses')).toHaveLength(0)
})

it('numérote sur la carte les seules activités localisées', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Carte')

  // La liste de la carte, pas celle de la colonne de côté.
  const items = wrapper
    .findAll('section ol li')
    .map((item) => item.findAll('span').map((span) => span.text()))

  expect(items).toEqual([['1', 'Musée des Confluences']])
})

it('liste participants et invitations en attente', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Participants')

  expect(wrapper.text()).toContain('Alice Martin')
  expect(wrapper.text()).toContain('Organisateur')
  expect(wrapper.text()).toContain('carla@example.test')
  expect(wrapper.text()).toContain('Invitation envoyée')
})

it('envoie la réponse de l’invité', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Participants')

  const decline = wrapper.findAll('button').find((button) => button.text() === 'Je ne peux pas')
  await decline?.trigger('click')
  await flushPromises()

  expect(sent('POST', '/api/events/e1/rsvp')[0]?.body).toEqual({ rsvp: 'declined' })
})

it('crée un lien partageable, le montre et confirme la copie', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Participants')

  const create = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Créer un lien partageable'))
  await create?.trigger('click')
  await flushPromises()

  const link = wrapper.get<HTMLInputElement>('input[aria-label="Lien d\'invitation à partager"]')
  expect(link.element.value).toBe('https://onsort.test/invite/tok')

  const copy = wrapper.findAll('button').find((button) => button.text() === 'Copier')
  await copy?.trigger('click')
  await flushPromises()

  expect(wrapper.text()).toContain('Lien copié dans le presse-papiers.')
})

it('invite par adresse', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Participants')

  await wrapper.get('#invite-email').setValue('dan@example.test')
  await wrapper.get('#invite-email').element.form?.dispatchEvent(new Event('submit'))
  await flushPromises()

  expect(sent('POST', '/api/events/e1/invitations')[0]?.body).toEqual({
    kind: 'email',
    email: 'dan@example.test',
  })
})

it('change le statut de l’événement', async () => {
  stubApi()
  const wrapper = await open()
  await showTab(wrapper, 'Participants')

  await wrapper.get('#status').setValue('closed')
  const apply = wrapper.findAll('button').find((button) => button.text() === 'Appliquer')
  await apply?.trigger('click')
  await flushPromises()

  expect(sent('PATCH', '/api/events/e1')[0]?.body).toEqual({ status: 'closed' })
})

it('rappelle le programme retenu dans la colonne de côté', async () => {
  stubApi()
  const wrapper = await open()

  const aside = wrapper.get('aside')

  expect(aside.text()).toContain('Le programme retenu')
  expect(aside.text()).toContain('Musée des Confluences')
  expect(aside.text()).not.toContain('Bouchon lyonnais')
})
