<script setup lang="ts">
import { ref, watch } from 'vue'
import MediaPicker from '../components/MediaPicker.vue'
import MediaThumb from '../components/MediaThumb.vue'
import { api, type Doc } from '../lib/api'
import { t } from '../lib/i18n'

const props = defineProps<{
  id: string
  modelValue: unknown
  readOnly: boolean
  invalid: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const media = ref<Doc | null>(null)
const picking = ref(false)

async function load(id: unknown) {
  if (id === null || id === undefined || id === '') {
    media.value = null
    return
  }
  if (media.value && String(media.value.id) === String(id)) return
  media.value = await api<Doc>('GET', `/media/${encodeURIComponent(String(id))}?depth=0`).catch(
    () => null,
  )
}
watch(() => props.modelValue, load, { immediate: true })

function choose(doc: Doc) {
  media.value = doc
  picking.value = false
  emit('update:modelValue', doc.id)
}
</script>

<template>
  <!-- The field label points at this group; buttons keep their own names. -->
  <div :id="id" class="upload" role="group" :aria-invalid="invalid">
    <div v-if="media" class="selected card">
      <MediaThumb :media="media" />
      <div class="info">
        <RouterLink :to="`/collections/media/${media.id}`" class="name">{{ media.alt || media.filename }}</RouterLink>
        <span class="muted small">{{ media.mimeType }}</span>
      </div>
      <div v-if="!readOnly" class="actions">
        <button type="button" class="btn btn-sm" @click="picking = true">{{ t('media.change') }}</button>
        <button type="button" class="btn btn-sm btn-ghost" @click="emit('update:modelValue', null)">{{ t('media.remove') }}</button>
      </div>
    </div>
    <button v-else-if="!readOnly" type="button" class="btn" @click="picking = true">
      {{ t('media.choose') }}
    </button>
    <span v-else class="muted">—</span>
    <MediaPicker :open="picking" @select="choose" @close="picking = false" />
  </div>
</template>

<style scoped>
.selected {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
}
.info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.name {
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.small {
  font-size: 0.8rem;
}
.actions {
  display: flex;
  gap: 0.25rem;
}
</style>
