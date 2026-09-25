<script setup lang="ts">
import { computed } from 'vue'

type Media = Record<string, unknown>

const props = withDefaults(defineProps<{ media: Media; size?: 'small' | 'large' }>(), {
  size: 'small',
})

const isImage = computed(
  () => typeof props.media.mimeType === 'string' && props.media.mimeType.startsWith('image/'),
)
const src = computed(() => {
  const sizes = (props.media.sizes ?? {}) as Record<string, { url?: string }>
  // Prefer a small resized copy for thumbnails.
  const small =
    props.size === 'small' ? (sizes.thumbnail?.url ?? Object.values(sizes)[0]?.url) : undefined
  return String(small ?? props.media.url ?? '')
})
const extension = computed(
  () =>
    String(props.media.filename ?? '')
      .split('.')
      .pop()
      ?.toUpperCase() ?? '',
)
</script>

<template>
  <div :class="['thumb', size]">
    <img v-if="isImage && src" :src="src" :alt="String(media.alt ?? '')" loading="lazy" />
    <span v-else class="file" aria-hidden="true">{{ extension }}</span>
  </div>
</template>

<style scoped>
.thumb {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background:
    repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px;
  border: 1px solid var(--border);
}
.small {
  width: 3rem;
  height: 3rem;
}
.small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.large {
  width: 100%;
  height: 22rem;
  padding: 0.5rem;
}
.large img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.file {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}
</style>
