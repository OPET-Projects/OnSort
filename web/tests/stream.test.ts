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
  const onChange = vi.fn()

  const wrapper = mountStream('e1', { onTally, onChange })
  instances[0]?.emit('activity.vote', {
    type: 'activity.vote',
    activityId: 'a1',
    for: 2,
    against: 1,
  })

  expect(onTally).toHaveBeenCalledWith('a1', { for: 2, against: 1 })
  expect(onChange).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('demande un rechargement sur les autres messages', () => {
  const instances = stubEventSource()
  const onTally = vi.fn()
  const onChange = vi.fn()

  const wrapper = mountStream('e1', { onTally, onChange })
  instances[0]?.emit('activity.created', { type: 'activity.created', id: 'a1' })
  instances[0]?.emit('activity.decided', { type: 'activity.decided', id: 'a1' })

  expect(onChange).toHaveBeenCalledTimes(2)
  expect(onTally).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('ferme le flux au démontage de la vue', () => {
  const instances = stubEventSource()

  const wrapper = mountStream('e1', { onTally: vi.fn(), onChange: vi.fn() })
  expect(instances[0]?.closed).toBe(false)

  wrapper.unmount()

  // Sans cette fermeture, naviguer d'un événement à l'autre laisserait une connexion
  // ouverte par événement visité.
  expect(instances[0]?.closed).toBe(true)
})
