<script setup lang="ts">
const { data: posts } = await useFetch('/api/posts')
</script>

<template>
  <section>
    <p v-if="!posts?.length">No posts yet. Run <code>pnpm seed</code>.</p>
    <article v-for="post in posts" :key="post.slug ?? post.title" class="post">
      <img v-if="post.cover" :src="post.cover.url" :alt="post.cover.alt ?? ''" class="cover" />
      <h2><NuxtLink :to="`/posts/${post.slug}`">{{ post.title }}</NuxtLink></h2>
      <small v-if="post.category">{{ post.category }}</small>
      <p>{{ post.excerpt }}</p>
    </article>
  </section>
</template>

<style scoped>
.cover {
  width: 100%;
  max-height: 14rem;
  object-fit: cover;
  border-radius: 8px;
}
</style>
