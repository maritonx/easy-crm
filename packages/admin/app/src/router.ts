import { createRouter, createWebHistory } from 'vue-router'
import { setUnauthorizedHandler } from './lib/api'
import { loadSession, session } from './lib/session'
import { settings } from './lib/settings'

const PUBLIC = new Set(['login', 'setup'])

export const router = createRouter({
  history: createWebHistory(settings.adminPath),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/setup', name: 'setup', component: () => import('./views/SetupView.vue') },
    {
      path: '/',
      component: () => import('./components/AppLayout.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
        {
          path: 'collections/:slug',
          name: 'list',
          component: () => import('./views/ListView.vue'),
        },
        {
          path: 'collections/:slug/new',
          name: 'create',
          component: () => import('./views/EditView.vue'),
        },
        {
          path: 'collections/:slug/:id',
          name: 'edit',
          component: () => import('./views/EditView.vue'),
        },
        {
          path: 'globals/:slug',
          name: 'global',
          component: () => import('./views/GlobalView.vue'),
        },
        { path: 'account', name: 'account', component: () => import('./views/AccountView.vue') },
        {
          path: ':rest(.*)*',
          name: 'not-found',
          component: () => import('./views/NotFoundView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (!session.loaded) await loadSession()
  const name = String(to.name ?? '')
  if (!session.user) {
    if (!session.hasUsers) return name === 'setup' ? true : { name: 'setup' }
    if (name === 'login') return true
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  if (PUBLIC.has(name)) return { name: 'dashboard' }
  return true
})

// A 401 from the API means the session expired: go back to the login page.
setUnauthorizedHandler(() => {
  session.user = null
  session.schema = null
  if (router.currentRoute.value.name !== 'login') {
    void router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
  }
})
