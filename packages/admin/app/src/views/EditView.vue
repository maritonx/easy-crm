<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import MediaThumb from '../components/MediaThumb.vue'
import FieldList from '../fields/FieldList.vue'
import { ApiError, api, type Doc } from '../lib/api'
import { initialValues, snapshot, titleOf, toFormValues } from '../lib/fields'
import { formatBytes, formatDate, label, singularize, t } from '../lib/i18n'
import { findCollection, loadSession, session, setFlash, takeFlash } from '../lib/session'

const route = useRoute()
const router = useRouter()
const slug = String(route.params.slug)
const id = route.params.id === undefined ? undefined : String(route.params.id)
const collection = findCollection(slug)
const isUsers = slug === 'users'
const isMedia = slug === 'media'
const published = computed(() => doc.value?.status === 'published')

const form = ref<Record<string, unknown>>(collection ? initialValues(collection.fields) : {})
const password = ref('')
const doc = ref<Doc | null>(null)
const baseline = ref('')
const loading = ref(id !== undefined)
const saving = ref(false)
const errors = ref<Record<string, string[]>>({})
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
const notFound = ref(false)
const confirmingDelete = ref(false)
const flash = takeFlash()
if (flash) message.value = { kind: 'success', text: flash }

// Collection-level permissions say what is possible at all; for an existing document the
// server resolves document-level rules (e.g. "only your own") into exact answers.
const docPermissions = ref<{ update: boolean; delete: boolean } | null>(null)
const canSave = computed(
  () =>
    !!collection && (id ? (docPermissions.value?.update ?? false) : collection.permissions.create),
)
const canDelete = computed(() => !!id && (docPermissions.value?.delete ?? false))
const readOnly = computed(() => !canSave.value)
// Media file metadata is shown above; only editable fields go in the form.
const mediaFields = computed(() => collection?.fields.filter((f) => !f.readOnly) ?? [])
const dirty = computed(() => snapshot([form.value, password.value]) !== baseline.value)
const singular = computed(() =>
  collection ? label(collection.labels?.singular, singularize(collection.slug)) : '',
)
const heading = computed(() =>
  id
    ? titleOf(collection, { ...(doc.value ?? {}), ...form.value, id })
    : t('edit.create', { label: singular.value }),
)

// Clear a field's server error as soon as the user edits it.
watch(form, (next, prev) => {
  if (!prev || Object.keys(errors.value).length === 0) return
  const changed = Object.keys(next).filter((key) => snapshot(next[key]) !== snapshot(prev[key]))
  if (changed.length === 0) return
  errors.value = Object.fromEntries(
    Object.entries(errors.value).filter(
      ([path]) => !changed.some((key) => path === key || path.startsWith(`${key}.`)),
    ),
  )
  if (Object.keys(errors.value).length === 0 && message.value?.kind === 'error')
    message.value = null
})
watch(password, () => {
  if (errors.value.password) {
    const { password: _, ...rest } = errors.value
    errors.value = rest
  }
})

function reset(values: Record<string, unknown>) {
  form.value = values
  password.value = ''
  baseline.value = snapshot([values, ''])
}

onMounted(async () => {
  if (!collection) return
  if (!id) {
    reset(initialValues(collection.fields))
    return
  }
  try {
    const [loaded, permissions] = await Promise.all([
      api<Doc>('GET', `/${slug}/${encodeURIComponent(id)}?depth=0&draft=true`),
      api<{ update: boolean; delete: boolean }>(
        'GET',
        `/admin/access/${slug}/${encodeURIComponent(id)}`,
      ),
    ])
    doc.value = loaded
    docPermissions.value = permissions
    reset(toFormValues(collection.fields, loaded))
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else
      message.value = { kind: 'error', text: t('common.error', { message: (e as Error).message }) }
  } finally {
    loading.value = false
  }
})

async function save(status?: 'draft' | 'published') {
  if (!collection) return
  saving.value = true
  errors.value = {}
  message.value = null
  const wasPublished = published.value
  const body: Record<string, unknown> = { ...form.value }
  if (status) body.status = status
  if (isUsers && password.value) body.password = password.value
  try {
    const saved = id
      ? await api<Doc>('PATCH', `/${slug}/${encodeURIComponent(id)}?depth=0`, body)
      : await api<Doc>('POST', `/${slug}?depth=0`, body)
    doc.value = saved
    reset(toFormValues(collection.fields, saved))
    const text = !id
      ? t('edit.created')
      : wasPublished && status === 'draft'
        ? t('edit.unpublished')
        : t('edit.saved')
    message.value = { kind: 'success', text }
    // Editing yourself may change what you can do (role, name shown in the sidebar).
    if (isUsers && String(saved.id) === String(session.user?.id)) await loadSession()
    if (!id) {
      setFlash(t('edit.created'))
      await router.replace(`/collections/${slug}/${saved.id}`)
    }
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      message.value = {
        kind: 'error',
        text: Object.keys(errors.value).length
          ? t('edit.fixErrors')
          : e.status === 403
            ? t('common.forbidden')
            : e.message,
      }
    } else {
      message.value = { kind: 'error', text: String(e) }
    }
  } finally {
    saving.value = false
  }
}

async function remove() {
  confirmingDelete.value = false
  try {
    await api('DELETE', `/${slug}/${encodeURIComponent(String(id))}`)
    baseline.value = snapshot([form.value, password.value])
    await router.push(`/collections/${slug}`)
  } catch (e) {
    message.value = {
      kind: 'error',
      text:
        e instanceof ApiError && e.status === 403 ? t('common.forbidden') : (e as Error).message,
    }
  }
}

// Warn before losing unsaved changes (FR-ADM-08).
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(() => (dirty.value && !saving.value ? window.confirm(t('edit.unsaved')) : true))
</script>

<template>
  <p v-if="!collection || notFound" class="notice">
    {{ notFound ? t('edit.notFound') : t('common.notFound') }}
    <RouterLink :to="`/collections/${slug}`">{{ t('common.back') }}</RouterLink>
  </p>
  <p v-else-if="loading" class="muted">{{ t('common.loading') }}</p>
  <form v-else class="editor" novalidate @submit.prevent="save(collection.drafts ? 'published' : undefined)">
    <header class="editor-header">
      <div>
        <RouterLink :to="`/collections/${slug}`" class="back">← {{ label(collection.labels?.plural, collection.slug) }}</RouterLink>
        <h1>{{ heading }}</h1>
        <p v-if="doc" class="meta muted">
          <span v-if="collection.drafts" :class="['badge', `badge-${doc.status}`]">
            {{ t(doc.status === 'published' ? 'status.published' : 'status.draft') }}
          </span>
          {{ t('list.updated') }} {{ formatDate(doc.updatedAt) }}
        </p>
      </div>
      <div class="actions">
        <span v-if="message" :class="['status', message.kind]" role="status" aria-live="polite">{{ message.text }}</span>
        <button v-if="canDelete" type="button" class="btn btn-danger" @click="confirmingDelete = true">
          {{ t('edit.delete') }}
        </button>
        <template v-if="canSave">
          <!-- A published document stays published on save; unpublishing is explicit (FR-DRF-05). -->
          <template v-if="collection.drafts && published">
            <button type="button" class="btn" :disabled="saving" @click="save('draft')">{{ t('edit.unpublish') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ t('edit.save') }}</button>
          </template>
          <template v-else-if="collection.drafts">
            <button type="button" class="btn" :disabled="saving" @click="save('draft')">{{ t('edit.saveDraft') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ t('edit.publish') }}</button>
          </template>
          <button v-else type="submit" class="btn btn-primary" :disabled="saving">{{ t('edit.save') }}</button>
        </template>
      </div>
    </header>

    <p v-if="readOnly" class="notice notice-warning">{{ t('edit.readOnly') }}</p>

    <div class="card form-body">
      <template v-if="isMedia && doc">
        <MediaThumb :media="doc" size="large" />
        <p class="muted media-meta">
          <a :href="String(doc.url)" target="_blank" rel="noopener">{{ doc.filename }}</a>
          · {{ doc.mimeType }}
          <template v-if="doc.width">· {{ t('media.size', { width: String(doc.width), height: String(doc.height), size: formatBytes(doc.filesize) }) }}</template>
          <template v-else>· {{ formatBytes(doc.filesize) }}</template>
        </p>
      </template>
      <FieldList v-model="form" :fields="isMedia ? mediaFields : collection.fields" :errors="errors" :read-only="readOnly" />
      <label v-if="isUsers && canSave" class="field">
        <span class="field-label">
          {{ id ? t('edit.newPassword') : t('edit.password') }}<span v-if="!id" class="field-required" aria-hidden="true">*</span>
        </span>
        <input
          v-model="password"
          class="input"
          type="password"
          autocomplete="new-password"
          :aria-invalid="!!errors.password"
          aria-describedby="password-error"
        />
        <span v-for="m in errors.password" id="password-error" :key="m" class="field-error">{{ m }}</span>
      </label>
    </div>

    <ConfirmDialog
      :open="confirmingDelete"
      :message="t('edit.confirmDelete')"
      :confirm-label="t('edit.delete')"
      @confirm="remove"
      @cancel="confirmingDelete = false"
    />
  </form>
</template>

<style scoped>
.editor-header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0 1rem;
  margin-top: -0.75rem;
  background: var(--bg);
}
.back {
  font-size: 0.85rem;
  text-decoration: none;
}
.meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
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
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.5rem;
}
.notice-warning {
  margin-bottom: 1rem;
}
.media-meta {
  margin: -0.5rem 0 0;
  font-size: 0.85rem;
}
</style>
