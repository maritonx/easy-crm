<script setup lang="ts">
import { ref } from 'vue'
import { ApiError, api } from '../lib/api'
import { t } from '../lib/i18n'
import { loadSession, session } from '../lib/session'

const name = ref(session.user?.name ?? '')
const password = ref('')
const errors = ref<Record<string, string[]>>({})
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
const saving = ref(false)

async function save() {
  if (!session.user) return
  saving.value = true
  errors.value = {}
  message.value = null
  const body: Record<string, unknown> = { name: name.value || null }
  if (password.value) body.password = password.value
  try {
    // Changing your own password ends other sessions; the server sends this browser a new cookie.
    await api('PATCH', `/users/${session.user.id}?depth=0`, body)
    message.value = {
      kind: 'success',
      text: password.value ? t('account.passwordChanged') : t('edit.saved'),
    }
    password.value = ''
    await loadSession()
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      message.value = {
        kind: 'error',
        text: Object.keys(errors.value).length ? t('edit.fixErrors') : e.message,
      }
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <h1>{{ t('account.title') }}</h1>
  <form class="card account" novalidate @submit.prevent="save">
    <p class="muted">{{ session.user?.email }} · {{ session.user?.role }}</p>
    <label class="field">
      <span class="field-label">{{ t('setup.name') }}</span>
      <input v-model="name" class="input" autocomplete="name" :aria-invalid="!!errors.name" />
      <span v-for="m in errors.name" :key="m" class="field-error">{{ m }}</span>
    </label>
    <label class="field">
      <span class="field-label">{{ t('account.changePassword') }}</span>
      <input
        v-model="password"
        class="input"
        type="password"
        autocomplete="new-password"
        :placeholder="t('edit.newPassword')"
        :aria-invalid="!!errors.password"
      />
      <span v-for="m in errors.password" :key="m" class="field-error">{{ m }}</span>
    </label>
    <div class="actions">
      <span v-if="message" :class="['status', message.kind]" role="status" aria-live="polite">{{ message.text }}</span>
      <button type="submit" class="btn btn-primary" :disabled="saving">{{ t('account.save') }}</button>
    </div>
  </form>
</template>

<style scoped>
h1 {
  margin-bottom: 1rem;
}
.account {
  max-width: 32rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.account p {
  margin: 0;
}
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}
.status {
  font-size: 0.875rem;
  font-weight: 550;
}
.status.success {
  color: var(--accent);
}
.status.error {
  color: var(--danger);
}
</style>
