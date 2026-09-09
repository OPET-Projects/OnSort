import { Hono } from 'hono'
import { expect, it, vi } from 'vitest'
import { ApiError, renderApiError } from '../../src/lib/http.ts'

const appThatThrows = (thrown: unknown) =>
  new Hono()
    .get('/boom', () => {
      throw thrown
    })
    .onError(renderApiError)

it('rend une ApiError dans la forme uniforme', async () => {
  const response = await appThatThrows(
    new ApiError('event_not_found', 404, 'Événement introuvable'),
  ).request('/boom')

  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({
    code: 'event_not_found',
    message: 'Événement introuvable',
    details: {},
  })
})

it('propage le details porté par une ApiError', async () => {
  const response = await appThatThrows(
    new ApiError('invalid_period', 400, 'Période invalide', { field: 'endsAt' }),
  ).request('/boom')

  expect(await response.json()).toEqual({
    code: 'invalid_period',
    message: 'Période invalide',
    details: { field: 'endsAt' },
  })
})

it('convertit une exception nue en 500 sans exposer de détail interne', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const response = await appThatThrows(new Error('secret interne')).request('/boom')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: 'internal_error',
      message: 'Une erreur interne est survenue.',
      details: {},
    })

    const logged = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(logged).toContain('secret interne')
  } finally {
    consoleErrorSpy.mockRestore()
  }
})
