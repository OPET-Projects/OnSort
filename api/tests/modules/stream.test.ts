import { expect, it } from 'vitest'
import { publish, subscriberCount } from '../../src/lib/sse.ts'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'

async function makeEvent(headers: Headers): Promise<string> {
  const response = await app.request('/api/events', {
    method: 'POST',
    headers: new Headers([...headers, ['content-type', 'application/json']]),
    body: JSON.stringify({
      title: 'Week-end',
      startsAt: '2026-10-01T18:00:00.000Z',
      endsAt: '2026-10-03T22:00:00.000Z',
    }),
  })
  return ((await response.json()) as { id: string }).id
}

// Un flux SSE ne se ferme jamais de lui-même. Tout test qui en ouvre un **doit** l'abandonner,
// sinon le battement de cœur maintient une minuterie ouverte et Vitest reste suspendu à la
// fin du fichier.
async function openStream(headers: Headers, eventId: string) {
  const controller = new AbortController()
  const response = await app.request(`/api/events/${eventId}/stream`, {
    headers,
    signal: controller.signal,
  })

  return {
    response,
    async close() {
      controller.abort()
      await response.body?.cancel().catch(() => {})
      // Laisser la boucle d'événements exécuter le gestionnaire d'abandon.
      await new Promise((resolve) => setTimeout(resolve, 50))
    },
  }
}

it('refuse le flux sans session', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const response = await app.request(`/api/events/${eventId}/stream`)

  expect(response.status).toBe(401)
})

it('refuse le flux à un non-participant', async () => {
  const alice = await signIn('alice@example.test')
  const bob = await signIn('bob@example.test')
  const eventId = await makeEvent(alice)

  const { response, close } = await openStream(bob, eventId)

  try {
    expect(response.status).toBe(403)
  } finally {
    await close()
  }
})

it('ouvre un flux d’événements pour un participant', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const { response, close } = await openStream(alice, eventId)

  try {
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('cache-control')).toContain('no-cache')
    // Désactive la mise en tampon d'un mandataire, sans quoi rien n'arrive en direct
    // (conception §5.2).
    expect(response.headers.get('x-accel-buffering')).toBe('no')
  } finally {
    await close()
  }
})

it('retire l’abonné du bus à la fermeture du flux', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)

  const { close } = await openStream(alice, eventId)
  expect(subscriberCount(eventId)).toBe(1)

  await close()

  // C'est le test qui prouve l'absence de fuite : sans désabonnement, chaque onglet fermé
  // laisserait un abonné mort dans le bus.
  expect(subscriberCount(eventId)).toBe(0)
})

it('remet au client un message publié sur le bus', async () => {
  const alice = await signIn('alice@example.test')
  const eventId = await makeEvent(alice)
  const { response, close } = await openStream(alice, eventId)

  try {
    const reader = response.body?.getReader()
    if (reader === undefined) {
      throw new Error('Le flux ne porte aucun corps lisible')
    }

    publish(eventId, { type: 'activity.vote', activityId: 'a1', for: 2, against: 1 })

    // Le décompte doit arriver sans que le client demande quoi que ce soit : c'est la
    // démonstration du jalon, réduite à sa plus petite preuve automatisable.
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('aucun message reçu en une seconde')), 1000),
      ),
    ])

    const payload = new TextDecoder().decode(chunk.value)
    expect(payload).toContain('event: activity.vote')
    expect(payload).toContain('"for":2')
    expect(payload).toContain('"against":1')

    reader.releaseLock()
  } finally {
    await close()
  }
})
