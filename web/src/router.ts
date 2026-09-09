import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from './stores/session'
import EventCreateView from './views/EventCreateView.vue'
import HomeView from './views/HomeView.vue'
import LoginView from './views/LoginView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/events/new',
      name: 'event-new',
      component: EventCreateView,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()

  if (session.status === 'unknown') {
    await session.fetchSession()
  }

  if (to.meta.requiresAuth && session.status !== 'authenticated') {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && session.status === 'authenticated') {
    return { name: 'home' }
  }

  return true
})
