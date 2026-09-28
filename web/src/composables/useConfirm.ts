import { ref } from 'vue'

// Demande de confirmation maison, à la place de `window.confirm` : même style que le reste de
// l'application, et un bouton destructif qui se lit comme tel. La vue monte un seul
// `ConfirmDialog` lié à `dialog`, et attend la réponse de `ask`.

export type ConfirmRequest = {
  title: string
  message: string
  confirmLabel: string
  tone?: 'danger' | 'neutral'
}

type DialogState = Required<ConfirmRequest> & { open: boolean }

const CLOSED: DialogState = {
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  tone: 'danger',
}

export function useConfirm() {
  const dialog = ref<DialogState>({ ...CLOSED })
  let settle: ((value: boolean) => void) | null = null

  function answer(value: boolean): void {
    settle?.(value)
    settle = null
    dialog.value = { ...CLOSED }
  }

  function ask(request: ConfirmRequest): Promise<boolean> {
    // Une demande restée ouverte est abandonnée, pas oubliée : l'action qui l'attend doit
    // pouvoir se terminer.
    settle?.(false)

    dialog.value = { open: true, tone: 'danger', ...request }

    return new Promise((resolve) => {
      settle = resolve
    })
  }

  return { dialog, ask, answer }
}
