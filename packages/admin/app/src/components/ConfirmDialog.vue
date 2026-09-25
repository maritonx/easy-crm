<script setup lang="ts">
import { ref, watch } from 'vue'
import { t } from '../lib/i18n'

const props = defineProps<{ open: boolean; message: string; confirmLabel?: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()

watch(
  () => props.open,
  (open) => {
    if (open) dialog.value?.showModal()
    else dialog.value?.close()
  },
)
</script>

<template>
  <dialog ref="dialog" class="dialog card" @cancel.prevent="emit('cancel')">
    <p>{{ message }}</p>
    <div class="actions">
      <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
      <button type="button" class="btn btn-danger" @click="emit('confirm')">
        {{ confirmLabel ?? t('common.confirm') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  max-width: 26rem;
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.dialog p {
  margin: 0 0 1.25rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
