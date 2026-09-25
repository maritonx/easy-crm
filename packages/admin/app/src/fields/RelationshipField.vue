<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import { titleOf } from '../lib/fields'
import { t } from '../lib/i18n'
import { findCollection } from '../lib/session'

type Id = number | string

const props = defineProps<{
  id: string
  to: string
  hasMany: boolean
  modelValue: unknown
  readOnly: boolean
  invalid: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [unknown] }>()

const target = findCollection(props.to)
const selectedIds = computed<Id[]>(() => {
  if (props.hasMany) return Array.isArray(props.modelValue) ? (props.modelValue as Id[]) : []
  return props.modelValue === null || props.modelValue === undefined ? [] : [props.modelValue as Id]
})

// Titles of selected documents, fetched once and cached.
const titles = ref<Record<string, string>>({})
async function loadTitles(ids: Id[]) {
  const missing = ids.filter((id) => !(String(id) in titles.value))
  if (!missing.length) return
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${props.to}${toQuery({ where: { id: { in: missing } }, limit: 100, depth: 0 })}`,
    )
    for (const doc of result.docs) titles.value[String(doc.id)] = titleOf(target, doc)
  } catch {
    // no read access: show ids
  }
  for (const id of missing) titles.value[String(id)] ??= `#${id}`
}
onMounted(() => loadTitles(selectedIds.value))
watch(selectedIds, loadTitles)

const query = ref('')
const open = ref(false)
const options = ref<Doc[]>([])
const active = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined

async function search() {
  const field = target?.useAsTitle
  const where = query.value && field ? { [field]: { like: query.value } } : undefined
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${props.to}${toQuery({ where, limit: 10, depth: 0, sort: field ?? '-updatedAt' })}`,
    )
    options.value = result.docs.filter((d) => !selectedIds.value.includes(d.id))
    for (const doc of result.docs) titles.value[String(doc.id)] = titleOf(target, doc)
  } catch {
    options.value = []
  }
  active.value = 0
}
function onInput() {
  open.value = true
  clearTimeout(timer)
  timer = setTimeout(search, 200)
}
function onFocus() {
  open.value = true
  void search()
}

function choose(doc: Doc) {
  titles.value[String(doc.id)] = titleOf(target, doc)
  emit('update:modelValue', props.hasMany ? [...selectedIds.value, doc.id] : doc.id)
  query.value = ''
  open.value = props.hasMany
  if (props.hasMany) void search()
}
function removeId(id: Id) {
  emit('update:modelValue', props.hasMany ? selectedIds.value.filter((v) => v !== id) : null)
}
function onKeydown(event: KeyboardEvent) {
  if (!open.value || !options.value.length) return
  if (event.key === 'ArrowDown') active.value = (active.value + 1) % options.value.length
  else if (event.key === 'ArrowUp')
    active.value = (active.value - 1 + options.value.length) % options.value.length
  else if (event.key === 'Enter') choose(options.value[active.value] as Doc)
  else if (event.key === 'Escape') open.value = false
  else return
  event.preventDefault()
}
const listId = computed(() => `${props.id}-options`)
</script>

<template>
  <div class="relationship">
    <ul v-if="selectedIds.length" class="chips">
      <li v-for="id in selectedIds" :key="String(id)" class="chip">
        <RouterLink :to="`/collections/${to}/${id}`">{{ titles[String(id)] ?? `#${id}` }}</RouterLink>
        <button v-if="!readOnly" type="button" class="chip-remove" :aria-label="t('field.remove', { title: titles[String(id)] ?? `#${id}` })" @click="removeId(id)">✕</button>
      </li>
    </ul>
    <div v-if="!readOnly && (hasMany || !selectedIds.length)" class="combo">
      <input
        :id="id"
        v-model="query"
        class="input"
        role="combobox"
        autocomplete="off"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-invalid="invalid"
        :aria-activedescendant="open && options.length ? `${listId}-${active}` : undefined"
        :placeholder="t('field.searchRelation')"
        @input="onInput"
        @focus="onFocus"
        @blur="open = false"
        @keydown="onKeydown"
      />
      <ul v-if="open" :id="listId" class="options card" role="listbox">
        <li
          v-for="(doc, index) in options"
          :id="`${listId}-${index}`"
          :key="String(doc.id)"
          role="option"
          :aria-selected="index === active"
          :class="{ active: index === active }"
          @mousedown.prevent="choose(doc)"
        >
          {{ titleOf(target, doc) }}
        </li>
        <li v-if="!options.length" class="muted empty">{{ t('field.noMatches') }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.relationship {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.35rem 0.2rem 0.65rem;
  border-radius: 999px;
  background: var(--accent-soft);
}
.chip a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 550;
}
.chip-remove {
  border: 0;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
}
.chip-remove:hover {
  background: var(--surface);
}
.combo {
  position: relative;
}
.options {
  position: absolute;
  z-index: 10;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 16rem;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
  box-shadow: var(--shadow);
}
.options li {
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.options li.active {
  background: var(--accent-soft);
}
.options li.empty {
  cursor: default;
}
</style>
