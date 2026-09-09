import { afterEach, expect, it, vi } from 'vitest'
import { useExpenses } from '../src/composables/useExpenses.ts'
import { formatCents, parseEurosToCents } from '../src/lib/money.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const expense = {
  id: 'x1',
  label: 'Taxi',
  amountCents: 1000,
  currency: 'EUR',
  activityId: null,
  splitMode: 'equal',
  createdAt: '2026-10-01T18:00:00.000Z',
  paidBy: { participantId: 'p1', name: 'Alice' },
  shares: [
    { participantId: 'p1', amountCents: 500 },
    { participantId: 'p2', amountCents: 500 },
  ],
}

const balanceBody = {
  balances: [
    { participantId: 'p1', name: 'Alice', balanceCents: 500, you: true },
    { participantId: 'p2', name: 'Bob', balanceCents: -500, you: false },
  ],
  transfers: [
    {
      fromParticipantId: 'p2',
      toParticipantId: 'p1',
      amountCents: 500,
      fromName: 'Bob',
      toName: 'Alice',
    },
  ],
  pendingSettlements: [],
}

const route = (url: string) =>
  url.endsWith('/expenses') ? json({ expenses: [expense] }) : json(balanceBody)

it('charge dépenses et soldes en une passe', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => route(url)),
  )

  const { state, expenses, balances, transfers, reload } = useExpenses('e1')
  await reload()

  expect(state.value).toBe('ready')
  expect(expenses.value).toHaveLength(1)
  expect(balances.value).toHaveLength(2)
  expect(transfers.value).toHaveLength(1)
})

it('passe à « empty » sans dépense, en gardant les soldes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/expenses')
        ? json({ expenses: [] })
        : json({ balances: balanceBody.balances, transfers: [], pendingSettlements: [] }),
    ),
  )

  const { state, balances, reload } = useExpenses('e1')
  await reload()

  expect(state.value).toBe('empty')
  expect(balances.value).toHaveLength(2)
})

it('recharge dépenses et soldes après une saisie', async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return json({ id: 'x2' }, 201)
    return route(url)
  })
  vi.stubGlobal('fetch', fetchMock)

  const { record } = useExpenses('e1')
  await record({ label: 'Musée', amountCents: 600 })

  // La saisie, puis les deux lectures du rechargement : une dépense saisie change un solde,
  // les deux moitiés de l'écran ne peuvent pas diverger.
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('passe en erreur quand le chargement échoue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({ code: 'not_a_participant', message: 'Vous ne participez pas.', details: {} }, 403),
    ),
  )

  const { state, error, reload } = useExpenses('e1')
  await reload()

  expect(state.value).toBe('error')
  expect(error.value).toBe('Vous ne participez pas.')
})

it('formate des centimes en euros', () => {
  // Espace insécable dans la sortie de Intl : la comparaison porte sur les chiffres.
  expect(formatCents(1234)).toMatch(/12,34/)
  expect(formatCents(0)).toMatch(/0,00/)
  expect(formatCents(-500)).toMatch(/5,00/)
})

// « 10,99 » vaut 1098.9999… en flottant : tronquer perdrait un centime à chaque dépense.
it('arrondit les euros saisis vers les centimes', () => {
  expect(parseEurosToCents('10,99')).toBe(1099)
  expect(parseEurosToCents('10.99')).toBe(1099)
  expect(parseEurosToCents('7')).toBe(700)
  expect(parseEurosToCents('0,015')).toBe(2)
})

it('rend NaN sur une saisie qui n’est pas un nombre', () => {
  expect(Number.isNaN(parseEurosToCents('abc'))).toBe(true)
  expect(Number.isNaN(parseEurosToCents(''))).toBe(true)
})
