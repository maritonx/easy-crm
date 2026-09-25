<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { api, type Paginated } from '../lib/api'
import { label, t } from '../lib/i18n'
import { session } from '../lib/session'

const collections = (session.schema?.collections ?? []).filter((c) => c.permissions.read)
const counts = reactive<Record<string, number | null>>({})

onMounted(() => {
  for (const c of collections) {
    counts[c.slug] = null
    api<Paginated<unknown>>('GET', `/${c.slug}?limit=1&depth=0&draft=true`)
      .then((r) => {
        counts[c.slug] = r.totalDocs
      })
      .catch(() => {})
  }
})
</script>

<template>
  <header class="page-header">
    <h1>{{ t('dashboard.title') }}</h1>
    <p class="muted">{{ t('dashboard.welcome', { name: session.user?.name || session.user?.email || '' }) }}</p>
  </header>
  <div class="grid">
    <RouterLink v-for="c in collections" :key="c.slug" :to="`/collections/${c.slug}`" class="card tile">
      <span class="tile-title">{{ label(c.labels?.plural, c.slug) }}</span>
      <span class="muted">{{ counts[c.slug] == null ? '…' : t('dashboard.documents', { count: counts[c.slug] ?? 0 }) }}</span>
    </RouterLink>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: 1.5rem;
}
.page-header p {
  margin: 0.25rem 0 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 0.75rem;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 1.1rem;
  color: var(--text);
  text-decoration: none;
}
.tile:hover {
  border-color: var(--accent);
}
.tile-title {
  font-weight: 600;
}
</style>
