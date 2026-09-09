import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type GroupSummary = {
  id: string
  name: string
  role: 'admin' | 'member'
  memberCount: number
}

export function useGroups() {
  const state = ref<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const groups = ref<GroupSummary[]>([])
  const error = ref('')

  async function reload(): Promise<void> {
    try {
      const body = await apiFetch<{ groups: GroupSummary[] }>('/api/groups')
      groups.value = body.groups
      state.value = body.groups.length === 0 ? 'empty' : 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      state.value = 'error'
    }
  }

  async function create(name: string): Promise<string> {
    const { id } = await apiFetch<{ id: string }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    await reload()
    return id
  }

  onMounted(reload)

  return { state, groups, error, reload, create }
}
