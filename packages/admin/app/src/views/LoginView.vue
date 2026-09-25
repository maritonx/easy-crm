<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import { ApiError } from '../lib/api'
import { t } from '../lib/i18n'
import { login } from '../lib/session'

const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await login(email.value, password.value)
    const redirect =
      typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
        ? route.query.redirect
        : '/'
    await router.replace(redirect)
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 429 ? t('login.locked') : t('login.failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthCard :title="t('login.title')">
    <form class="form" @submit.prevent="submit">
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <label class="field">
        <span class="field-label">{{ t('login.email') }}</span>
        <input v-model="email" class="input" type="email" autocomplete="username" required autofocus />
      </label>
      <label class="field">
        <span class="field-label">{{ t('login.password') }}</span>
        <input v-model="password" class="input" type="password" autocomplete="current-password" required />
      </label>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ t('login.submit') }}</button>
    </form>
  </AuthCard>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
