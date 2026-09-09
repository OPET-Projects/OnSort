import { createRouter, createWebHistory } from 'vue-router'
import { splitAuthError } from './lib/redirect'
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
    {
      path: '/events/:id',
      name: 'event',
      component: () => import('./views/EventView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/me/calendar',
      name: 'calendar',
      component: () => import('./views/CalendarView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/groups',
      name: 'groups',
      component: () => import('./views/GroupsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/groups/:id',
      name: 'group',
      component: () => import('./views/GroupView.vue'),
      meta: { requiresAuth: true },
    },
    {
      // Pas de `requiresAuth` : la vue résout elle-même l'authentification puis la reprise.
      path: '/invite/:token',
      name: 'invite',
      component: () => import('./views/InviteAcceptView.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()

  if (session.status === 'unknown') {
    await session.fetchSession()
  }

  if (to.meta.requiresAuth && session.status !== 'authenticated') {
    // L'erreur d'authentification est hissée dans la requête de `/login` au lieu de rester
    // enfouie dans `redirect` : c'est le formulaire qui doit l'expliquer, et le chemin de
    // reprise ne doit pas la traîner après une connexion réussie.
    const { redirect, error } = splitAuthError(to.path, to.query)

    return {
      name: 'login',
      query: error === '' ? { redirect } : { redirect, error },
    }
  }

  if (to.name === 'login' && session.status === 'authenticated') {
    return { name: 'home' }
  }

  return true
})
