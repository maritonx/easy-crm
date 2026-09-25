<script setup lang="ts">
import type { AdminField } from '@easy-cms/core'
import { computed, defineAsyncComponent, ref } from 'vue'
import { fromLocalInput, toLocalInput } from '../lib/fields'
import { label, t } from '../lib/i18n'
import ArrayField from './ArrayField.vue'
import FieldList from './FieldList.vue'
import RelationshipField from './RelationshipField.vue'

// Tiptap is large; load it only when a rich text field is shown (NFR-PERF-03).
const RichTextField = defineAsyncComponent(() => import('./RichTextField.vue'))

const props = defineProps<{
  field: AdminField
  modelValue: unknown
  path: string
  errors: Record<string, string[]>
  readOnly: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const id = computed(() => `field-${props.path.replace(/[^\w-]/g, '-')}`)
const errorId = computed(() => `${id.value}-error`)
const messages = computed(() => props.errors[props.path] ?? [])
const invalid = computed(() => messages.value.length > 0)
const text = computed(() => label(props.field.label, props.field.name))
const set = (value: unknown) => emit('update:modelValue', value)

const jsonText = ref(
  props.field.type === 'json' ? JSON.stringify(props.modelValue ?? null, null, 2) : '',
)
const jsonError = ref(false)
function onJsonInput(value: string) {
  jsonText.value = value
  if (value.trim() === '') {
    jsonError.value = false
    set(null)
    return
  }
  try {
    set(JSON.parse(value))
    jsonError.value = false
  } catch {
    jsonError.value = true
  }
}

function toggleOption(value: string, checked: boolean) {
  const current = Array.isArray(props.modelValue) ? (props.modelValue as string[]) : []
  set(checked ? [...current, value] : current.filter((v) => v !== value))
}

const numberValue = computed(() => (typeof props.modelValue === 'number' ? props.modelValue : ''))
function onNumber(value: string) {
  set(value === '' ? null : Number(value))
}
</script>

<template>
  <fieldset v-if="field.type === 'group'" class="group">
    <legend class="field-label">{{ text }}</legend>
    <FieldList
      :fields="field.fields ?? []"
      :model-value="(modelValue as Record<string, unknown>) ?? {}"
      :prefix="`${path}.`"
      :errors="errors"
      :read-only="readOnly"
      @update:model-value="set"
    />
  </fieldset>

  <ArrayField
    v-else-if="field.type === 'array'"
    :field="field"
    :model-value="(modelValue as Record<string, unknown>[]) ?? []"
    :path="path"
    :errors="errors"
    :read-only="readOnly"
    @update:model-value="set"
  />

  <div v-else-if="field.type === 'boolean'" class="field">
    <label class="checkbox">
      <input
        :id="id"
        type="checkbox"
        :checked="modelValue === true"
        :disabled="readOnly"
        :aria-invalid="invalid"
        :aria-describedby="invalid ? errorId : undefined"
        @change="set(($event.target as HTMLInputElement).checked)"
      />
      <span class="field-label">{{ text }}</span>
    </label>
    <p v-for="m in messages" :id="errorId" :key="m" class="field-error">{{ m }}</p>
  </div>

  <fieldset v-else-if="field.type === 'select' && field.hasMany" class="field">
    <legend class="field-label">{{ text }}<span v-if="field.required" class="field-required" aria-hidden="true">*</span></legend>
    <div class="options">
      <label v-for="option in field.options" :key="option.value" class="checkbox">
        <input
          type="checkbox"
          :checked="Array.isArray(modelValue) && modelValue.includes(option.value)"
          :disabled="readOnly"
          @change="toggleOption(option.value, ($event.target as HTMLInputElement).checked)"
        />
        {{ label(option.label, option.value) }}
      </label>
    </div>
    <p v-for="m in messages" :key="m" class="field-error">{{ m }}</p>
  </fieldset>

  <div v-else class="field">
    <label :for="id" class="field-label">
      {{ text }}<span v-if="field.required" class="field-required" aria-hidden="true">*</span>
    </label>

    <input
      v-if="field.type === 'text' || field.type === 'email' || field.type === 'slug'"
      :id="id"
      class="input"
      :type="field.type === 'email' ? 'email' : 'text'"
      :value="modelValue ?? ''"
      :maxlength="field.maxLength"
      :disabled="readOnly"
      :aria-required="field.required ? 'true' : undefined"
      :aria-invalid="invalid"
      :aria-describedby="invalid ? errorId : undefined"
      @input="set(($event.target as HTMLInputElement).value)"
    />
    <textarea
      v-else-if="field.type === 'textarea'"
      :id="id"
      class="textarea"
      :value="(modelValue as string) ?? ''"
      :maxlength="field.maxLength"
      :disabled="readOnly"
      :aria-required="field.required ? 'true' : undefined"
      :aria-invalid="invalid"
      :aria-describedby="invalid ? errorId : undefined"
      @input="set(($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else-if="field.type === 'number'"
      :id="id"
      class="input"
      type="number"
      step="any"
      :value="numberValue"
      :min="field.min"
      :max="field.max"
      :disabled="readOnly"
      :aria-required="field.required ? 'true' : undefined"
      :aria-invalid="invalid"
      :aria-describedby="invalid ? errorId : undefined"
      @input="onNumber(($event.target as HTMLInputElement).value)"
    />
    <input
      v-else-if="field.type === 'date'"
      :id="id"
      class="input"
      type="datetime-local"
      :value="toLocalInput(modelValue)"
      :disabled="readOnly"
      :aria-required="field.required ? 'true' : undefined"
      :aria-invalid="invalid"
      :aria-describedby="invalid ? errorId : undefined"
      @input="set(fromLocalInput(($event.target as HTMLInputElement).value))"
    />
    <select
      v-else-if="field.type === 'select'"
      :id="id"
      class="select"
      :value="modelValue ?? ''"
      :disabled="readOnly"
      :aria-required="field.required ? 'true' : undefined"
      :aria-invalid="invalid"
      :aria-describedby="invalid ? errorId : undefined"
      @change="set(($event.target as HTMLSelectElement).value || null)"
    >
      <option value="">{{ t('field.none') }}</option>
      <option v-for="option in field.options" :key="option.value" :value="option.value">
        {{ label(option.label, option.value) }}
      </option>
    </select>
    <textarea
      v-else-if="field.type === 'json'"
      :id="id"
      class="textarea mono"
      :value="jsonText"
      :disabled="readOnly"
      :aria-invalid="invalid || jsonError"
      :aria-describedby="invalid || jsonError ? errorId : undefined"
      @input="onJsonInput(($event.target as HTMLTextAreaElement).value)"
    />
    <RichTextField
      v-else-if="field.type === 'richText'"
      :id="id"
      :model-value="modelValue as Record<string, unknown> | null"
      :read-only="readOnly"
      :invalid="invalid"
      @update:model-value="set"
    />
    <RelationshipField
      v-else-if="field.type === 'relationship'"
      :id="id"
      :to="field.to ?? ''"
      :has-many="field.hasMany === true"
      :model-value="modelValue"
      :read-only="readOnly"
      :invalid="invalid"
      @update:model-value="set"
    />
    <template v-else-if="field.type === 'upload'">
      <input
        :id="id"
        class="input"
        inputmode="numeric"
        :value="modelValue ?? ''"
        :disabled="readOnly"
        :aria-invalid="invalid"
        @input="set(($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null)"
      />
      <span class="field-hint">{{ t('field.uploadSoon') }}</span>
    </template>

    <span v-if="field.type === 'slug' && field.from" class="field-hint">↳ {{ field.from }}</span>
    <p v-if="jsonError" :id="errorId" class="field-error">{{ t('field.invalidJson') }}</p>
    <p v-for="m in messages" :id="errorId" :key="m" class="field-error">{{ m }}</p>
  </div>
</template>

<style scoped>
.group {
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.group > legend {
  padding: 0 0.35rem;
}
.options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
}
</style>
