import { expect, it, vi } from 'vitest'
import { publish, subscribe, subscriberCount, userRoom } from '../../src/lib/sse.ts'

it('remet un message à l’abonné de l’événement visé', () => {
  const received: unknown[] = []
  const unsubscribe = subscribe('e1', (event) => received.push(event))

  publish('e1', { type: 'activity.created', id: 'a1' })

  expect(received).toEqual([{ type: 'activity.created', id: 'a1' }])
  unsubscribe()
})

it('ne remet pas le message d’un autre événement', () => {
  const received: unknown[] = []
  const unsubscribe = subscribe('e1', (event) => received.push(event))

  publish('e2', { type: 'activity.created', id: 'a1' })

  expect(received).toEqual([])
  unsubscribe()
})

it('remet à deux abonnés du même événement — les deux écrans', () => {
  const premier: unknown[] = []
  const second: unknown[] = []
  const un = subscribe('e1', (event) => premier.push(event))
  const deux = subscribe('e1', (event) => second.push(event))

  publish('e1', { type: 'activity.vote', activityId: 'a1', for: 2, against: 1 })

  expect(premier).toHaveLength(1)
  expect(second).toEqual(premier)
  un()
  deux()
})

it('retire l’abonné au désabonnement', () => {
  const received: unknown[] = []
  const unsubscribe = subscribe('e1', (event) => received.push(event))
  expect(subscriberCount('e1')).toBe(1)

  unsubscribe()

  expect(subscriberCount('e1')).toBe(0)
  publish('e1', { type: 'activity.created', id: 'a1' })
  expect(received).toEqual([])
})

it('tolère un désabonnement répété', () => {
  const unsubscribe = subscribe('e1', () => {})

  unsubscribe()

  expect(() => unsubscribe()).not.toThrow()
  expect(subscriberCount('e1')).toBe(0)
})

it('continue de diffuser quand un abonné lève', () => {
  // Une connexion morte ne doit pas faire taire le flux des autres : c'est le cas qui
  // transforme un onglet fermé en panne de temps réel pour tout le monde.
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const received: unknown[] = []
    const cassé = subscribe('e1', () => {
      throw new Error('connexion morte')
    })
    const sain = subscribe('e1', (event) => received.push(event))

    expect(() => publish('e1', { type: 'activity.created', id: 'a1' })).not.toThrow()
    expect(received).toHaveLength(1)

    cassé()
    sain()
  } finally {
    consoleErrorSpy.mockRestore()
  }
})

it('laisse un abonné se désabonner pendant la diffusion', () => {
  // Le cas réel : le client abandonne sa requête au moment même où un message part.
  // Itérer sur le Set en cours de modification sauterait un abonné.
  const received: unknown[] = []
  let partant: () => void = () => {}

  partant = subscribe('e1', () => partant())
  const restant = subscribe('e1', (event) => received.push(event))

  expect(() => publish('e1', { type: 'activity.created', id: 'a1' })).not.toThrow()
  expect(received).toHaveLength(1)

  restant()
})

// Un salon personnel ne doit jamais se confondre avec un salon d'événement : les deux
// identifiants sont des UUID, la collision est improbable — mais « improbable » n'est pas
// une garantie, le préfixe en est une.
it("ne confond pas un salon personnel et un salon d'événement de même identifiant", () => {
  const id = 'meme-identifiant'
  const versEvenement: ServerEvent[] = []
  const versPersonne: ServerEvent[] = []

  const stopEvenement = subscribe(id, (event) => versEvenement.push(event))
  const stopPersonne = subscribe(userRoom(id), (event) => versPersonne.push(event))

  publish(userRoom(id), { type: 'notification.created', id: 'n1' })

  stopEvenement()
  stopPersonne()

  expect(versEvenement).toEqual([])
  expect(versPersonne).toHaveLength(1)
})

it("n'adresse pas le salon d'une personne à une autre", () => {
  const recus: ServerEvent[] = []
  const stop = subscribe(userRoom('alice'), (event) => recus.push(event))

  publish(userRoom('bob'), { type: 'notification.created', id: 'n1' })

  stop()

  expect(recus).toEqual([])
})
