<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import FieldRenderer from './FieldRenderer.vue'

const props = defineProps<{
  fields: readonly AdminField[]
  modelValue: Record<string, unknown>
  /** Path prefix for error lookup, e.g. "links.0." */
  prefix?: string
  errors: Record<string, string[]>
  readOnly?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, unknown>] }>()

function update(name: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [name]: value })
}
</script>

<template>
  <div class="field-list">
    <FieldRenderer
      v-for="field in fields"
      :key="field.name"
      :field="field"
      :model-value="modelValue[field.name]"
      :path="`${prefix ?? ''}${field.name}`"
      :errors="errors"
      :read-only="readOnly || field.readOnly === true"
      @update:model-value="update(field.name, $event)"
    />
  </div>
</template>

<style scoped>
.field-list {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
</style>
