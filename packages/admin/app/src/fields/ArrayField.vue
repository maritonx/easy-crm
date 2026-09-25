<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import { computed } from 'vue'
import { initialValues } from '../lib/fields'
import { label, t } from '../lib/i18n'
import FieldList from './FieldList.vue'

type Row = Record<string, unknown>

const props = defineProps<{
  field: AdminField
  modelValue: Row[]
  path: string
  errors: Record<string, string[]>
  readOnly: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Row[]] }>()

const rows = computed(() => props.modelValue ?? [])
const messages = computed(() => props.errors[props.path] ?? [])
const canAdd = computed(
  () =>
    !props.readOnly &&
    (props.field.maxRows === undefined || rows.value.length < props.field.maxRows),
)

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Date.now() + Math.random())
}
function add() {
  emit('update:modelValue', [
    ...rows.value,
    { id: newId(), ...initialValues(props.field.fields ?? []) },
  ])
}
function remove(index: number) {
  emit(
    'update:modelValue',
    rows.value.filter((_, i) => i !== index),
  )
}
function move(index: number, delta: number) {
  const next = [...rows.value]
  const [row] = next.splice(index, 1)
  next.splice(index + delta, 0, row as Row)
  emit('update:modelValue', next)
}
function update(index: number, row: Row) {
  emit(
    'update:modelValue',
    rows.value.map((r, i) => (i === index ? { ...row, id: r.id } : r)),
  )
}
</script>

<template>
  <fieldset class="array">
    <legend class="field-label">
      {{ label(field.label, field.name) }}<span v-if="field.required" class="field-required" aria-hidden="true">*</span>
    </legend>
    <ol class="rows">
      <li v-for="(row, index) in rows" :key="String(row.id ?? index)" class="row card">
        <div class="row-header">
          <span class="muted row-title">{{ t('field.row', { n: index + 1 }) }}</span>
          <div v-if="!readOnly" class="row-actions">
            <button type="button" class="btn btn-ghost btn-icon" :disabled="index === 0" :aria-label="t('field.moveUp', { n: index + 1 })" @click="move(index, -1)">↑</button>
            <button type="button" class="btn btn-ghost btn-icon" :disabled="index === rows.length - 1" :aria-label="t('field.moveDown', { n: index + 1 })" @click="move(index, 1)">↓</button>
            <button type="button" class="btn btn-ghost btn-icon" :aria-label="t('field.removeRow', { n: index + 1 })" @click="remove(index)">✕</button>
          </div>
        </div>
        <FieldList
          :fields="field.fields ?? []"
          :model-value="row"
          :prefix="`${path}.${index}.`"
          :errors="errors"
          :read-only="readOnly"
          @update:model-value="update(index, $event)"
        />
      </li>
    </ol>
    <button v-if="canAdd" type="button" class="btn btn-sm add" @click="add">+ {{ t('field.addRow') }}</button>
    <p v-for="m in messages" :key="m" class="field-error">{{ m }}</p>
  </fieldset>
</template>

<style scoped>
.array {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.row {
  padding: 0.75rem 1rem 1rem;
  background: var(--bg);
}
.row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.row-title {
  font-size: 0.82rem;
  font-weight: 600;
}
.row-actions {
  display: flex;
  gap: 0.15rem;
}
.add {
  align-self: flex-start;
}
</style>
