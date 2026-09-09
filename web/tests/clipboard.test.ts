import { afterEach, expect, it, vi } from 'vitest'
import { copyToClipboard } from '../src/lib/clipboard.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('copie par le presse-papiers moderne quand il répond', async () => {
  const writeText = vi.fn(async () => undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })

  expect(await copyToClipboard('https://exemple.test/invite/abc')).toBe(true)
  expect(writeText).toHaveBeenCalledWith('https://exemple.test/invite/abc')
})

// Contexte non sécurisé ou permission refusée : un échec silencieux laisserait
// l'organisateur coller autre chose que son lien sans le savoir.
it('retombe sur execCommand quand le presse-papiers refuse', async () => {
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: vi.fn(async () => {
        throw new Error('refusé')
      }),
    },
  })
  const execCommand = vi.fn(() => true)
  Object.assign(document, { execCommand })

  expect(await copyToClipboard('lien')).toBe(true)
  expect(execCommand).toHaveBeenCalledWith('copy')
})

it('retombe sur execCommand quand le presse-papiers est absent', async () => {
  vi.stubGlobal('navigator', {})
  const execCommand = vi.fn(() => true)
  Object.assign(document, { execCommand })

  expect(await copyToClipboard('lien')).toBe(true)
})

it('rend false quand les deux chemins échouent', async () => {
  vi.stubGlobal('navigator', {})
  Object.assign(document, {
    execCommand: vi.fn(() => {
      throw new Error('indisponible')
    }),
  })

  expect(await copyToClipboard('lien')).toBe(false)
})

// Le champ temporaire ne doit jamais survivre à la copie, réussie ou non.
it('ne laisse aucun champ derrière lui', async () => {
  vi.stubGlobal('navigator', {})
  Object.assign(document, { execCommand: vi.fn(() => true) })

  await copyToClipboard('lien')

  expect(document.querySelectorAll('textarea')).toHaveLength(0)
})
