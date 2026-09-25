<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { label, locale, setLocale, t } from '../lib/i18n'
import { logout, session } from '../lib/session'

const router = useRouter()
const collections = computed(
  () => session.schema?.collections.filter((c) => c.permissions.read) ?? [],
)
const globals = computed(() => session.schema?.globals.filter((g) => g.permissions.read) ?? [])

async function onLogout() {
  await logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="layout">
    <nav class="sidebar" aria-label="Main">
      <RouterLink to="/" class="brand">
        <span class="logo" aria-hidden="true" />
        {{ t('app.name') }}
      </RouterLink>

      <RouterLink to="/" class="nav-link" exact-active-class="active">{{ t('nav.dashboard') }}</RouterLink>

      <template v-if="collections.length">
        <h2 class="nav-heading">{{ t('nav.collections') }}</h2>
        <RouterLink
          v-for="c in collections"
          :key="c.slug"
          :to="`/collections/${c.slug}`"
          class="nav-link"
          active-class="active"
        >
          {{ label(c.labels?.plural, c.slug) }}
        </RouterLink>
      </template>

      <template v-if="globals.length">
        <h2 class="nav-heading">{{ t('nav.globals') }}</h2>
        <RouterLink v-for="g in globals" :key="g.slug" :to="`/globals/${g.slug}`" class="nav-link" active-class="active">
          {{ label(g.label, g.slug) }}
        </RouterLink>
      </template>

      <div class="sidebar-footer">
        <RouterLink to="/account" class="nav-link" active-class="active">
          {{ t('nav.account') }}
          <span class="muted user-email">{{ session.user?.email }}</span>
        </RouterLink>
        <button type="button" class="nav-link as-button" @click="setLocale(locale === 'th' ? 'en' : 'th')">
          {{ t('nav.language') }}
        </button>
        <button type="button" class="nav-link as-button" @click="onLogout">{{ t('nav.logout') }}</button>
      </div>
    </nav>
    <main class="content">
      <RouterView :key="$route.fullPath" />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  min-height: 100vh;
}
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 1rem 0.75rem;
  background: var(--surface);
  border-right: 1px solid var(--border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.25rem 0.5rem 1rem;
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--text);
  text-decoration: none;
}
.logo {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 6px;
  background: var(--accent);
}
.nav-heading {
  margin: 1rem 0 0.25rem;
  padding: 0 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.nav-link {
  display: flex;
  flex-direction: column;
  padding: 0.4rem 0.5rem;
  border-radius: var(--radius-sm);
  color: var(--text);
  text-decoration: none;
  font: inherit;
  text-align: left;
}
.nav-link:hover {
  background: var(--surface-2);
}
.nav-link.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.as-button {
  border: 0;
  background: none;
  cursor: pointer;
  width: 100%;
}
.sidebar-footer {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.user-email {
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
.content {
  padding: 1.75rem 2rem 4rem;
  max-width: 72rem;
  width: 100%;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 12.5rem minmax(0, 1fr);
  }
  .content {
    padding: 1.25rem 1rem 3rem;
  }
}
</style>
