<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import FieldList from '../fields/FieldList.vue'
import { ApiError, api } from '../lib/api'
import { snapshot, toFormValues } from '../lib/fields'
import { formatDate, label, t } from '../lib/i18n'
import { findGlobal } from '../lib/session'

type Data = Record<string, unknown>

const route = useRoute()
const slug = String(route.params.slug)
const global = findGlobal(slug)

const form = ref<Data>({})
const meta = ref<{ updatedAt?: unknown; status?: unknown }>({})
const baseline = ref('')
const loading = ref(true)
const saving = ref(false)
const errors = ref<Record<string, string[]>>({})
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
const readOnly = computed(() => !global?.permissions.update)
const dirty = computed(() => snapshot(form.value) !== baseline.value)

function reset(data: Data) {
  if (!global) return
  form.value = toFormValues(global.fields, data)
  meta.value = { updatedAt: data.updatedAt, status: data.status }
  baseline.value = snapshot(form.value)
}

onMounted(async () => {
  if (!global) return
  try {
    reset(await api<Data>('GET', `/globals/${slug}?depth=0&draft=true`))
  } catch (e) {
    message.value = { kind: 'error', text: t('common.error', { message: (e as Error).message }) }
  } finally {
    loading.value = false
  }
})

async function save(status?: 'draft' | 'published') {
  saving.value = true
  errors.value = {}
  message.value = null
  try {
    reset(
      await api<Data>(
        'POST',
        `/globals/${slug}?depth=0`,
        status ? { ...form.value, status } : form.value,
      ),
    )
    message.value = { kind: 'success', text: t('edit.saved') }
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

function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(() => (dirty.value ? window.confirm(t('edit.unsaved')) : true))
</script>

<template>
  <p v-if="!global" class="notice">{{ t('common.notFound') }}</p>
  <p v-else-if="loading" class="muted">{{ t('common.loading') }}</p>
  <form v-else novalidate @submit.prevent="save(global.drafts ? 'published' : undefined)">
    <header class="editor-header">
      <div>
        <h1>{{ label(global.label, global.slug) }}</h1>
        <p v-if="meta.updatedAt" class="muted meta">
          <span v-if="global.drafts" :class="['badge', `badge-${meta.status}`]">
            {{ t(meta.status === 'published' ? 'status.published' : 'status.draft') }}
          </span>
          {{ t('list.updated') }} {{ formatDate(meta.updatedAt) }}
        </p>
      </div>
      <div class="actions">
        <span v-if="message" :class="['status', message.kind]" role="status" aria-live="polite">{{ message.text }}</span>
        <template v-if="!readOnly">
          <button v-if="global.drafts" type="button" class="btn" :disabled="saving" @click="save('draft')">{{ t('edit.saveDraft') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">{{ global.drafts ? t('edit.publish') : t('edit.save') }}</button>
        </template>
      </div>
    </header>
    <p v-if="readOnly" class="notice notice-warning">{{ t('edit.readOnly') }}</p>
    <div class="card form-body">
      <FieldList v-model="form" :fields="global.fields" :errors="errors" :read-only="readOnly" />
    </div>
  </form>
</template>

<style scoped>
.editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
.form-body {
  padding: 1.5rem;
}
.notice-warning {
  margin-bottom: 1rem;
}
</style>
