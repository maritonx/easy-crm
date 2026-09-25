<script setup lang="ts">
const { data: posts } = await useFetch('/api/posts')
</script>

<template>
  <section>
    <p v-if="!posts?.length">No posts yet. Run <code>pnpm seed</code>.</p>
    <article v-for="post in posts" :key="post.slug ?? post.title" class="post">
      <h2><NuxtLink :to="`/posts/${post.slug}`">{{ post.title }}</NuxtLink></h2>
      <small v-if="post.category">{{ post.category }}</small>
      <p>{{ post.excerpt }}</p>
    </article>
  </section>
</template>
