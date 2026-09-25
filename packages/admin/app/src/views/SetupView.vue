<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import { ApiError } from '../lib/api'
import { t } from '../lib/i18n'
import { registerFirstUser } from '../lib/session'

const router = useRouter()
const name = ref('')
const email = ref('')
const password = ref('')
const errors = ref<Record<string, string[]>>({})
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  errors.value = {}
  try {
    await registerFirstUser({
      email: email.value,
      password: password.value,
      ...(name.value ? { name: name.value } : {}),
    })
    await router.replace('/')
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (Object.keys(errors.value).length === 0) error.value = e.message
    } else {
      error.value = String(e)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthCard :title="t('setup.title')">
    <p class="muted intro">{{ t('setup.intro') }}</p>
    <form class="form" @submit.prevent="submit">
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <label class="field">
        <span class="field-label">{{ t('setup.name') }}</span>
        <input v-model="name" class="input" autocomplete="name" />
      </label>
      <label class="field">
        <span class="field-label">{{ t('login.email') }}</span>
        <input v-model="email" class="input" type="email" autocomplete="username" required :aria-invalid="!!errors.email" />
        <span v-for="m in errors.email" :key="m" class="field-error">{{ m }}</span>
      </label>
      <label class="field">
        <span class="field-label">{{ t('login.password') }}</span>
        <input
          v-model="password"
          class="input"
          type="password"
          autocomplete="new-password"
          minlength="8"
          required
          :aria-invalid="!!errors.password"
        />
        <span v-for="m in errors.password" :key="m" class="field-error">{{ m }}</span>
      </label>
      <button class="btn btn-primary" type="submit" :disabled="busy">{{ t('setup.submit') }}</button>
    </form>
  </AuthCard>
</template>

<style scoped>
.intro {
  margin: -0.5rem 0 0;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
