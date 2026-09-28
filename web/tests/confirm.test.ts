import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { nextTick } from 'vue'
import ConfirmDialog from '../src/components/ConfirmDialog.vue'
import { useConfirm } from '../src/composables/useConfirm.ts'

const request = {
  title: 'Retirer Bob ?',
  message: 'Il perd l’accès au groupe.',
  confirmLabel: 'Retirer',
}

it('ouvre la demande avec ses textes, et la ferme sur une réponse', async () => {
  const { dialog, ask, answer } = useConfirm()

  const pending = ask(request)
  expect(dialog.value).toMatchObject({ open: true, ...request, tone: 'danger' })

  answer(true)
  expect(await pending).toBe(true)
  expect(dialog.value.open).toBe(false)
})

it('rend faux sur une annulation', async () => {
  const { ask, answer } = useConfirm()

  const pending = ask(request)
  answer(false)

  expect(await pending).toBe(false)
})

// Une seconde demande remplace la première : celle-ci ne doit pas rester suspendue à
// jamais, sinon l'action qui l'attend ne se termine pas.
it('annule une demande restée en suspens quand une autre arrive', async () => {
  const { ask, answer } = useConfirm()

  const first = ask(request)
  const second = ask({ ...request, title: 'Bloquer Bob ?' })
  answer(true)

  expect(await first).toBe(false)
  expect(await second).toBe(true)
})

function mountDialog() {
  return mount(ConfirmDialog, {
    props: { open: true, tone: 'danger', ...request },
    attachTo: document.body,
  })
}

it('affiche la demande et répond au clic', async () => {
  const wrapper = mountDialog()

  expect(wrapper.get('[role="dialog"]').text()).toContain('Retirer Bob ?')

  await wrapper.get('[data-answer="yes"]').trigger('click')
  await wrapper.get('[data-answer="no"]').trigger('click')

  expect(wrapper.emitted('answer')).toEqual([[true], [false]])
  wrapper.unmount()
})

it('annule sur Échap', async () => {
  const wrapper = mountDialog()

  await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })

  expect(wrapper.emitted('answer')).toEqual([[false]])
  wrapper.unmount()
})

// Entrée ne doit pas confirmer par accident un geste destructif : le focus part sur Annuler.
it('place le focus sur Annuler à l’ouverture', async () => {
  const wrapper = mountDialog()
  await nextTick()

  expect(document.activeElement).toBe(wrapper.get('[data-answer="no"]').element)
  wrapper.unmount()
})

it('ne rend rien quand elle est fermée', () => {
  const wrapper = mount(ConfirmDialog, { props: { open: false, tone: 'danger', ...request } })

  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})
