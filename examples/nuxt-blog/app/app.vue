<script setup lang="ts">
const { data: site } = await useFetch('/api/site')
useHead({ title: () => site.value?.siteName ?? 'Blog' })
</script>

<template>
  <div class="page">
    <header>
      <NuxtLink to="/" class="brand">{{ site?.siteName }}</NuxtLink>
      <p v-if="site?.tagline">{{ site.tagline }}</p>
    </header>
    <main><NuxtPage /></main>
    <footer>Powered by Easy CMS · <a href="/api/cms/posts">REST API</a></footer>
  </div>
</template>

<style>
body { margin: 0; font-family: system-ui, sans-serif; color: #1f2328; background: #fff; }
.page { max-width: 42rem; margin: 0 auto; padding: 2rem 1rem; }
.brand { font-size: 1.5rem; font-weight: 700; color: inherit; text-decoration: none; }
footer { margin-top: 4rem; color: #656d76; font-size: 0.875rem; }
a { color: #0969da; }
</style>
