
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import MediaThumb from '../components/MediaThumb.vue'
import UploadDropzone from '../components/UploadDropzone.vue'
import { ApiError, api, type Doc, type Paginated, toQuery } from '../lib/api'
import { titleOf } from '../lib/fields'
import { formatDate, humanize, label, t } from '../lib/i18n'
import { findCollection } from '../lib/session'

const route = useRoute()
const router = useRouter()
const slug = String(route.params.slug)
const collection = findCollection(slug)
const PAGE_SIZE = 20
const isMedia = slug === 'media'

const titleField = collection?.useAsTitle
const titleLabel = computed(() => {
  const field = collection?.fields.find((f) => f.name === titleField)
  return field ? label(field.label, field.name) : 'ID'
})

// State lives in the URL so back/forward and reloads keep it.
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const sort = computed(() =>
  typeof route.query.sort === 'string' ? route.query.sort : '-updatedAt',
)

const result = ref<Paginated<Doc> | null>(null)
const loading = ref(false)
const error = ref('')
const selected = ref<Set<Doc['id']>>(new Set())
const confirming = ref(false)

async function load() {
  if (!collection) return
  loading.value = true
  error.value = ''
  try {
    const where = search.value && titleField ? { [titleField]: { like: search.value } } : undefined
    result.value = await api<Paginated<Doc>>(
      'GET',
      `/${slug}${toQuery({ where, sort: sort.value, limit: PAGE_SIZE, page: page.value, depth: 0, draft: true })}`,
    )
    selected.value = new Set()
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 403
        ? t('common.forbidden')
        : String((e as Error).message)
  } finally {
    loading.value = false
  }
}

function setQuery(patch: Record<string, string | undefined>) {
  const query = { ...route.query, ...patch }
  for (const key of Object.keys(query))
    if (query[key] === undefined || query[key] === '') delete query[key]
  void router.replace({ query })
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => setQuery({ q: value, page: undefined }), 250)
})
watch(() => route.query, load)
onMounted(load)
// A pending search must not apply its query to the next page.
onBeforeUnmount(() => clearTimeout(debounce))

function toggleSort(field: string) {
  setQuery({ sort: sort.value === field ? `-${field}` : field, page: undefined })
}
function sortState(field: string): 'ascending' | 'descending' | 'none' {
  if (sort.value === field) return 'ascending'
  if (sort.value === `-${field}`) return 'descending'
  return 'none'
}

const allSelected = computed(
  () => !!result.value?.docs.length && result.value.docs.every((d) => selected.value.has(d.id)),
)
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(result.value?.docs.map((d) => d.id))
}
function toggle(id: Doc['id']) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function deleteSelected() {
  confirming.value = false
  const ids = [...selected.value]
  try {
    for (const id of ids) await api('DELETE', `/${slug}/${id}`)
  } catch (e) {
    error.value = (e as Error).message
  }
  await load()
}
</script>

<template>
  <p v-if="!collection" class="notice">{{ t('common.notFound') }}</p>
  <template v-else>
    <header class="toolbar">
      <h1>{{ label(collection.labels?.plural, collection.slug) }}</h1>
      <!-- Media is created by uploading, below. -->
      <RouterLink v-if="collection.permissions.create && !isMedia" :to="`/collections/${slug}/new`" class="btn btn-primary">
        {{ t('list.new') }}
      </RouterLink>
    </header>

    <div class="filters">
      <label v-if="titleField" class="search">
        <span class="visually-hidden">{{ t('list.search', { field: titleLabel }) }}</span>
        <input v-model="search" class="input" type="search" :placeholder="t('list.search', { field: titleLabel })" />
      </label>
      <div v-if="selected.size" class="bulk">
        <span class="muted">{{ t('list.selected', { count: selected.size }) }}</span>
        <button v-if="collection.permissions.delete" type="button" class="btn btn-danger btn-sm" @click="confirming = true">
          {{ t('list.deleteSelected') }}
        </button>
      </div>
    </div>

    <UploadDropzone v-if="isMedia && collection.permissions.create" class="dropzone" @uploaded="load" />

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

    <div class="card table-wrap" :aria-busy="loading">
      <table>
        <thead>
          <tr>
            <th class="check">
              <input type="checkbox" :checked="allSelected" :aria-label="t('list.selectAll')" @change="toggleAll" />
            </th>
            <th v-if="isMedia" class="preview"><span class="visually-hidden">{{ t('media.preview') }}</span></th>
            <th :aria-sort="titleField ? sortState(titleField) : undefined">
              <button v-if="titleField" type="button" class="sort" @click="toggleSort(titleField)">
                {{ titleLabel }} <span aria-hidden="true">{{ { ascending: '↑', descending: '↓', none: '' }[sortState(titleField)] }}</span>
              </button>
              <span v-else>{{ titleLabel }}</span>
            </th>
            <th v-if="collection.drafts">{{ t('list.status') }}</th>
            <th :aria-sort="sortState('updatedAt')" class="date">
              <button type="button" class="sort" @click="toggleSort('updatedAt')">
                {{ t('list.updated') }} <span aria-hidden="true">{{ { ascending: '↑', descending: '↓', none: '' }[sortState('updatedAt')] }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="doc in result?.docs ?? []" :key="doc.id" :class="{ selected: selected.has(doc.id) }">
            <td class="check">
              <input
                type="checkbox"
                :checked="selected.has(doc.id)"
                :aria-label="t('list.selectRow', { title: titleOf(collection, doc) })"
                @change="toggle(doc.id)"
              />
            </td>
            <td v-if="isMedia" class="preview"><MediaThumb :media="doc" /></td>
            <td>
              <RouterLink :to="`/collections/${slug}/${doc.id}`" class="title-link">{{ titleOf(collection, doc) }}</RouterLink>
            </td>
            <td v-if="collection.drafts">
              <span :class="['badge', `badge-${doc.status}`]">{{ t(doc.status === 'published' ? 'status.published' : 'status.draft') }}</span>
            </td>
            <td class="date muted">{{ formatDate(doc.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="result && !result.docs.length" class="empty muted">
        {{ search ? t('list.noResults') : t('list.empty') }}
      </p>
    </div>

    <nav v-if="result && result.totalPages > 1" class="pagination" :aria-label="humanize('pagination')">
      <button type="button" class="btn btn-sm" :disabled="!result.hasPrevPage" @click="setQuery({ page: String(page - 1) })">
        {{ t('list.previous') }}
      </button>
      <span class="muted">{{ t('list.page', { page: result.page, pages: result.totalPages }) }}</span>
      <button type="button" class="btn btn-sm" :disabled="!result.hasNextPage" @click="setQuery({ page: String(page + 1) })">
        {{ t('list.next') }}
      </button>
    </nav>

    <ConfirmDialog
      :open="confirming"
      :message="t('list.confirmDelete', { count: selected.size })"
      :confirm-label="t('edit.delete')"
      @confirm="deleteSelected"
      @cancel="confirming = false"
    />
  </template>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.search {
  flex: 1;
  max-width: 22rem;
}
.bulk {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.6rem 0.85rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
th {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-2);
}
tbody tr:last-child td {
  border-bottom: 0;
}
tbody tr:hover,
tr.selected {
  background: var(--surface-2);
}
.check {
  width: 2.5rem;
}
.preview {
  width: 4rem;
  padding-top: 0.35rem;
  padding-bottom: 0.35rem;
}
.dropzone {
  margin-bottom: 0.75rem;
}
.check input {
  accent-color: var(--accent);
}
.date {
  width: 12rem;
  white-space: nowrap;
}
.sort {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.title-link {
  color: var(--text);
  font-weight: 550;
  text-decoration: none;
}
.title-link:hover {
  color: var(--accent);
  text-decoration: underline;
}
.empty {
  padding: 2rem;
  margin: 0;
  text-align: center;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
}
</style>
