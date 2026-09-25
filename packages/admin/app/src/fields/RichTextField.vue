<script setup lang="ts">
import Image from '@tiptap/extension-image'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { onBeforeUnmount, ref, watch } from 'vue'
import MediaPicker from '../components/MediaPicker.vue'
import { t } from '../lib/i18n'

type Doc = Record<string, unknown>

const props = defineProps<{
  id: string
  modelValue: Doc | null
  readOnly: boolean
  invalid: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [Doc | null] }>()

const editor = useEditor({
  content: props.modelValue ?? '',
  editable: !props.readOnly,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'] },
    }),
    Image,
  ],
  editorProps: {
    attributes: {
      id: props.id,
      class: 'rte-content',
      role: 'textbox',
      'aria-multiline': 'true',
      ...(props.invalid ? { 'aria-invalid': 'true' } : {}),
    },
  },
  onUpdate({ editor }) {
    emit('update:modelValue', editor.isEmpty ? null : (editor.getJSON() as Doc))
  },
})

// Keep in sync when the document is replaced from outside (e.g. after save).
watch(
  () => props.modelValue,
  (value) => {
    const current = editor.value
    if (!current) return
    if (
      JSON.stringify(value ?? null) !== JSON.stringify(current.isEmpty ? null : current.getJSON())
    ) {
      current.commands.setContent(value ?? '', { emitUpdate: false })
    }
  },
)
watch(
  () => props.readOnly,
  (readOnly) => editor.value?.setEditable(!readOnly),
)
onBeforeUnmount(() => editor.value?.destroy())

function setLink() {
  const current = editor.value?.getAttributes('link').href as string | undefined
  const url = window.prompt(t('rte.linkPrompt'), current ?? 'https://')
  if (url === null) return
  const chain = editor.value?.chain().focus().extendMarkRange('link')
  if (url.trim() === '') chain?.unsetLink().run()
  else chain?.setLink({ href: url.trim() }).run()
}
const pickingImage = ref(false)
function addImage() {
  pickingImage.value = true
}
function insertImage(src: string, alt = '') {
  pickingImage.value = false
  editor.value?.chain().focus().setImage({ src, alt }).run()
}

type Action = { key: string; label: string; text: string; run: () => void; active?: () => boolean }
const actions = (): Action[] => {
  const e = editor.value
  if (!e) return []
  const heading = (level: 2 | 3 | 4): Action => ({
    key: `h${level}`,
    label: t('rte.heading', { level }),
    text: `H${level}`,
    run: () => e.chain().focus().toggleHeading({ level }).run(),
    active: () => e.isActive('heading', { level }),
  })
  return [
    heading(2),
    heading(3),
    heading(4),
    {
      key: 'b',
      label: t('rte.bold'),
      text: 'B',
      run: () => e.chain().focus().toggleBold().run(),
      active: () => e.isActive('bold'),
    },
    {
      key: 'i',
      label: t('rte.italic'),
      text: 'I',
      run: () => e.chain().focus().toggleItalic().run(),
      active: () => e.isActive('italic'),
    },
    {
      key: 'u',
      label: t('rte.underline'),
      text: 'U',
      run: () => e.chain().focus().toggleUnderline().run(),
      active: () => e.isActive('underline'),
    },
    {
      key: 'code',
      label: t('rte.code'),
      text: '</>',
      run: () => e.chain().focus().toggleCode().run(),
      active: () => e.isActive('code'),
    },
    {
      key: 'link',
      label: t('rte.link'),
      text: '🔗',
      run: setLink,
      active: () => e.isActive('link'),
    },
    {
      key: 'ul',
      label: t('rte.bulletList'),
      text: '•',
      run: () => e.chain().focus().toggleBulletList().run(),
      active: () => e.isActive('bulletList'),
    },
    {
      key: 'ol',
      label: t('rte.orderedList'),
      text: '1.',
      run: () => e.chain().focus().toggleOrderedList().run(),
      active: () => e.isActive('orderedList'),
    },
    {
      key: 'quote',
      label: t('rte.blockquote'),
      text: '❝',
      run: () => e.chain().focus().toggleBlockquote().run(),
      active: () => e.isActive('blockquote'),
    },
    { key: 'img', label: t('rte.image'), text: '🖼', run: addImage },
    { key: 'undo', label: t('rte.undo'), text: '↶', run: () => e.chain().focus().undo().run() },
    { key: 'redo', label: t('rte.redo'), text: '↷', run: () => e.chain().focus().redo().run() },
  ]
}
</script>

<template>
  <div :class="['rte', { invalid, readonly: readOnly }]">
    <div v-if="!readOnly && editor" class="rte-toolbar" role="toolbar" :aria-controls="id">
      <button
        v-for="action in actions()"
        :key="action.key"
        type="button"
        class="rte-button"
        :class="{ active: action.active?.() }"
        :aria-label="action.label"
        :aria-pressed="action.active ? action.active() : undefined"
        :title="action.label"
        @mousedown.prevent
        @click="action.run"
      >
        {{ action.text }}
      </button>
    </div>
    <EditorContent v-if="editor" :editor="editor" />
    <MediaPicker
      :open="pickingImage"
      images-only
      allow-url
      @select="insertImage(String($event.url), String($event.alt ?? ''))"
      @url="insertImage($event)"
      @close="pickingImage = false"
    />
  </div>
</template>

<style scoped>
.rte {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.rte.invalid {
  border-color: var(--danger);
}
.rte:focus-within {
  border-color: var(--focus);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem;
  padding: 0.35rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.rte-button {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.45rem;
  border: 1px solid transparent;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.rte-button:hover {
  background: var(--surface);
}
.rte-button.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}
.rte :deep(.rte-content) {
  min-height: 10rem;
  padding: 0.75rem 0.9rem;
  outline: none;
}
.rte :deep(.rte-content > :first-child) {
  margin-top: 0;
}
.rte :deep(.rte-content img) {
  max-width: 100%;
  height: auto;
}
.rte :deep(.rte-content blockquote) {
  margin-left: 0;
  padding-left: 1rem;
  border-left: 3px solid var(--border-strong);
  color: var(--text-muted);
}
.rte :deep(.rte-content code) {
  font-family: var(--mono);
  background: var(--surface-2);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}
</style>
