<script setup lang="ts">
import { locale, setLocale, t } from '../lib/i18n'

defineProps<{ title: string }>()
</script>

<template>
  <main class="auth">
    <div class="card auth-card">
      <div class="auth-brand"><span class="logo" aria-hidden="true" />{{ t('app.name') }}</div>
      <h1>{{ title }}</h1>
      <slot />
    </div>
    <button type="button" class="btn btn-ghost btn-sm" @click="setLocale(locale === 'th' ? 'en' : 'th')">
      {{ t('nav.language') }}
    </button>
  </main>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
}
.auth-card {
  width: 100%;
  max-width: 24rem;
  padding: 2rem;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.auth-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  color: var(--text-muted);
}
.logo {
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 6px;
  background: var(--accent);
}
</style>
