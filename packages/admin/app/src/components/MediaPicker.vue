<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import { t } from '../lib/i18n'
import MediaThumb from './MediaThumb.vue'
import UploadDropzone from './UploadDropzone.vue'

const props = defineProps<{ open: boolean; imagesOnly?: boolean; allowUrl?: boolean }>()
const emit = defineEmits<{ select: [Doc]; url: [string]; close: [] }>()

const dialog = ref<HTMLDialogElement>()
const search = ref('')
const items = ref<Doc[]>([])
const page = ref(1)
const hasMore = ref(false)
const urlInput = ref('')

async function load(reset = true) {
  if (reset) page.value = 1
  const where: Record<string, unknown> = {}
  if (search.value)
    where.or = [{ filename: { like: search.value } }, { alt: { like: search.value } }]
  if (props.imagesOnly) where.mimeType = { like: 'image/' }
  const result = await api<Paginated<Doc>>(
    'GET',
    `/media${toQuery({ where, limit: 24, page: page.value, sort: '-createdAt', depth: 0 })}`,
  )
  items.value = reset ? result.docs : [...items.value, ...result.docs]
  hasMore.value = result.hasNextPage
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      dialog.value?.showModal()
      void load()
    } else {
      dialog.value?.close()
    }
  },
)
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => load(), 250)
})
onMounted(() => {
  if (props.open) void load()
})

function onUploaded(docs: Doc[]) {
  // Picking right after uploading is the common case.
  if (docs.length === 1) emit('select', docs[0] as Doc)
  else void load()
}
function insertUrl() {
  if (urlInput.value.trim()) emit('url', urlInput.value.trim())
  urlInput.value = ''
}
</script>

<template>
  <dialog ref="dialog" class="picker card" :aria-label="t('media.pickerTitle')" @cancel.prevent="emit('close')">
    <header class="picker-header">
      <h2>{{ t('media.pickerTitle') }}</h2>
      <button type="button" class="btn btn-ghost btn-icon" :aria-label="t('common.cancel')" @click="emit('close')">✕</button>
    </header>
    <UploadDropzone :accept="imagesOnly ? 'image/*' : undefined" :multiple="false" @uploaded="onUploaded" />
    <input v-model="search" class="input" type="search" :placeholder="t('field.searchRelation')" />
    <p v-if="!items.length" class="muted">{{ t('media.empty') }}</p>
    <ul class="grid">
      <li v-for="item in items" :key="String(item.id)">
        <button type="button" class="item" :title="String(item.filename)" @click="emit('select', item)">
          <MediaThumb :media="item" />
          <span class="name">{{ item.alt || item.filename }}</span>
        </button>
      </li>
    </ul>
    <button v-if="hasMore" type="button" class="btn btn-sm" @click="page++, load(false)">{{ t('list.next') }}</button>
    <form v-if="allowUrl" class="url" @submit.prevent="insertUrl">
      <label class="field">
        <span class="field-label">{{ t('rte.imageFromUrl') }}</span>
        <span class="url-row">
          <input v-model="urlInput" class="input" type="url" placeholder="https://" />
          <button type="submit" class="btn">{{ t('common.confirm') }}</button>
        </span>
      </label>
    </form>
  </dialog>
</template>

<style scoped>
.picker {
  width: min(52rem, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.picker[open] {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.picker::backdrop {
  background: rgb(0 0 0 / 35%);
}
.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.picker-header h2 {
  font-size: 1.1rem;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.6rem;
  overflow-y: auto;
}
.item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  padding: 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font: inherit;
}
.item:hover {
  border-color: var(--accent);
}
.item :deep(.thumb) {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}
.name {
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.url-row {
  display: flex;
  gap: 0.5rem;
}
</style>
