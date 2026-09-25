<script setup lang="ts">
const route = useRoute()
const { data: post, error } = await useFetch(`/api/posts/${route.params.slug}`, {
  headers: useRequestHeaders(['cookie']),
})
const cover = computed(() => {
  const c = post.value?.cover
  return c && typeof c === 'object' ? { url: String(c.url), alt: String(c.alt ?? '') } : null
})
</script>

<template>
  <p v-if="error">Post not found. <NuxtLink to="/">Back</NuxtLink></p>
  <article v-else-if="post">
    <p v-if="post.status === 'draft'"><strong>Draft preview</strong></p>
    <img v-if="cover" :src="cover.url" :alt="cover.alt" class="cover" />
    <h1>{{ post.title }}</h1>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized by renderRichText -->
    <div class="body" v-html="post.html" />
  </article>
</template>

<style scoped>
.cover {
  width: 100%;
  border-radius: 8px;
}
</style>
