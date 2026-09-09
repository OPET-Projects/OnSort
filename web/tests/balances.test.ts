import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import BalanceSheet from '../src/components/BalanceSheet.vue'

const alice = { participantId: 'p1', name: 'Alice', balanceCents: 500, you: false }
const bob = { participantId: 'p2', name: 'Bob', balanceCents: -500, you: false }

const transfer = {
  fromParticipantId: 'p2',
  toParticipantId: 'p1',
  amountCents: 500,
  fromName: 'Bob',
  toName: 'Alice',
}

const pending = {
  id: 's1',
  fromParticipantId: 'p2',
  toParticipantId: 'p1',
  fromName: 'Bob',
  toName: 'Alice',
  amountCents: 500,
  declaredAt: '2026-10-01T20:00:00.000Z',
}

const sheet = (props: Partial<Parameters<typeof mount>[1]> & Record<string, unknown>) =>
  mount(BalanceSheet, {
    props: {
      balances: [],
      transfers: [],
      pendingSettlements: [],
      viewerId: 'p3',
      ...props,
    },
  })

it('propose au débiteur de déclarer son virement', () => {
  const wrapper = sheet({ balances: [alice, bob], transfers: [transfer], viewerId: 'p2' })

  expect(wrapper.text()).toContain("J'ai envoyé")
})

// Afficher un bouton qui répondrait 403 serait un mensonge d'interface.
it("n'offre pas au créancier de déclarer le virement d'un autre", () => {
  const wrapper = sheet({ balances: [alice, bob], transfers: [transfer], viewerId: 'p1' })

  expect(wrapper.text()).not.toContain("J'ai envoyé")
})

it('propose au créancier de confirmer une déclaration reçue', () => {
  const wrapper = sheet({ pendingSettlements: [pending], viewerId: 'p1' })

  expect(wrapper.text()).toContain("J'ai reçu")
  expect(wrapper.text()).not.toContain('Retirer')
})

it('propose au débiteur de retirer sa déclaration, pas de la confirmer', () => {
  const wrapper = sheet({ pendingSettlements: [pending], viewerId: 'p2' })

  expect(wrapper.text()).toContain('Retirer')
  expect(wrapper.text()).not.toContain("J'ai reçu")
})

it("n'offre aucun bouton à un tiers", () => {
  const wrapper = sheet({
    balances: [alice, bob],
    transfers: [transfer],
    pendingSettlements: [pending],
    viewerId: 'p3',
  })

  expect(wrapper.findAll('button')).toHaveLength(0)
})

it('émet la déclaration avec le bénéficiaire et le montant', async () => {
  const wrapper = sheet({ transfers: [transfer], viewerId: 'p2' })

  await wrapper.find('button').trigger('click')

  expect(wrapper.emitted('declare')).toEqual([['p1', 500]])
})

it('dit que tout est réglé quand aucun virement ne reste', () => {
  const wrapper = sheet({
    balances: [
      { participantId: 'p1', name: 'Alice', balanceCents: 0, you: true },
      { participantId: 'p2', name: 'Bob', balanceCents: 0, you: false },
    ],
    viewerId: 'p1',
  })

  expect(wrapper.text()).toContain('Tout est réglé')
})

it("nomme « Vous » le solde de l'appelant", () => {
  const wrapper = sheet({
    balances: [{ ...alice, you: true }, bob],
    viewerId: 'p1',
  })

  expect(wrapper.text()).toContain('Vous')
  expect(wrapper.text()).not.toContain('Alice')
})
