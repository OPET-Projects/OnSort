import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useEventStream } from '../src/composables/useEventStream.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

// `EventSource` n'existe pas dans happy-dom : on le bouchonne par une fausse classe qui
// retient ses écouteurs, pour pouvoir déclencher un message à la main.
type Listener = (event: MessageEvent) => void

function stubEventSource() {
  const instances: FakeEventSource[] = []

  class FakeEventSource {
    listeners = new Map<string, Listener>()
    closed = false
    url: string

    constructor(url: string) {
      this.url = url
      instances.push(this)
    }

    addEventListener(type: string, listener: Listener) {
      this.listeners.set(type, listener)
    }

    close() {
      this.closed = true
    }

    emit(type: string, payload: unknown) {
      this.listeners.get(type)?.({ data: JSON.stringify(payload) } as MessageEvent)
    }
  }

  vi.stubGlobal('EventSource', FakeEventSource)
  return instances
}

// Monte le composable dans un composant jetable : c'est le seul moyen d'éprouver
// `onMounted` et surtout `onUnmounted`, qui porte la fermeture du flux.
function mountStream(eventId: string, handlers: Parameters<typeof useEventStream>[1]) {
  const component = defineComponent({
    setup() {
      useEventStream(eventId, handlers)
      return () => h('div')
    },
  })

  return mount(component)
}

it('applique un décompte reçu sans rien recharger', () => {
  const instances = stubEventSource()
  const onTally = vi.fn()
  const onActivityChange = vi.fn()

  const wrapper = mountStream('e1', { onTally, onActivityChange, onParticipantChange: vi.fn() })
  instances[0]?.emit('activity.vote', {
    type: 'activity.vote',
    activityId: 'a1',
    for: 2,
    against: 1,
  })

  expect(onTally).toHaveBeenCalledWith('a1', { for: 2, against: 1 })
  expect(onActivityChange).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('demande un rechargement du programme sur les autres messages d’activité', () => {
  const instances = stubEventSource()
  const onTally = vi.fn()
  const onActivityChange = vi.fn()

  const wrapper = mountStream('e1', { onTally, onActivityChange, onParticipantChange: vi.fn() })
  instances[0]?.emit('activity.created', { type: 'activity.created', id: 'a1' })
  instances[0]?.emit('activity.updated', { type: 'activity.updated', id: 'a1' })
  instances[0]?.emit('activity.decided', { type: 'activity.decided', id: 'a1' })

  expect(onActivityChange).toHaveBeenCalledTimes(3)
  expect(onTally).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('recharge l’événement quand une réponse change', () => {
  const instances = stubEventSource()
  const onParticipantChange = vi.fn()
  const onActivityChange = vi.fn()

  const wrapper = mountStream('e1', {
    onTally: vi.fn(),
    onActivityChange,
    onParticipantChange,
  })
  instances[0]?.emit('participant.rsvp', { type: 'participant.rsvp', id: 'p1' })

  // Une réponse change la liste des participants et le droit de proposer ou de voter :
  // c'est l'événement qu'il faut recharger, pas le programme.
  expect(onParticipantChange).toHaveBeenCalledTimes(1)
  expect(onActivityChange).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('ferme le flux au démontage de la vue', () => {
  const instances = stubEventSource()

  const wrapper = mountStream('e1', {
    onTally: vi.fn(),
    onActivityChange: vi.fn(),
    onParticipantChange: vi.fn(),
  })
  expect(instances[0]?.closed).toBe(false)

  wrapper.unmount()

  // Sans cette fermeture, naviguer d'un événement à l'autre laisserait une connexion
  // ouverte par événement visité.
  expect(instances[0]?.closed).toBe(true)
})
