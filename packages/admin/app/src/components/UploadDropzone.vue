<script setup lang="ts">
import { ref } from 'vue'
import { ApiError, type Doc, uploadFile } from '../lib/api'
import { t } from '../lib/i18n'

const props = defineProps<{ accept?: string | undefined; multiple?: boolean }>()
const emit = defineEmits<{ uploaded: [Doc[]] }>()

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const busy = ref('')
const errors = ref<string[]>([])
const done = ref('')

async function upload(files: File[]) {
  errors.value = []
  done.value = ''
  const uploaded: Doc[] = []
  for (const file of files) {
    busy.value = t('media.uploading', { name: file.name })
    try {
      uploaded.push(await uploadFile(file))
    } catch (e) {
      const message = e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : String(e)
      errors.value.push(t('media.failed', { name: file.name, message }))
    }
  }
  busy.value = ''
  if (uploaded.length) {
    done.value = t('media.uploaded', { count: uploaded.length })
    emit('uploaded', uploaded)
  }
  if (input.value) input.value.value = ''
}

function onChange(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  if (files.length) void upload(props.multiple === false ? files.slice(0, 1) : files)
}
function onDrop(event: DragEvent) {
  dragging.value = false
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length) void upload(props.multiple === false ? files.slice(0, 1) : files)
}
</script>

<template>
  <div
    :class="['dropzone', { dragging }]"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <label class="btn btn-sm">
      {{ t('media.upload') }}
      <input
        ref="input"
        class="visually-hidden"
        type="file"
        :accept="accept"
        :multiple="multiple !== false"
        :disabled="!!busy"
        @change="onChange"
      />
    </label>
    <span class="muted">{{ busy || done || t('media.drop') }}</span>
    <ul v-if="errors.length" class="errors" role="alert">
      <li v-for="e in errors" :key="e" class="field-error">{{ e }}</li>
    </ul>
  </div>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
}
.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.dropzone label:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.errors {
  flex-basis: 100%;
  margin: 0;
  padding-left: 1.1rem;
}
</style>
