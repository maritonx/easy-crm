<script setup lang="ts">
const route = useRoute()
const { data: post, error } = await useFetch(`/api/posts/${route.params.slug}`, {
  headers: useRequestHeaders(['cookie']),
})

// Rich text rendering (renderRichText) arrives with @easy-cms/richtext; until then show the text.
type Node = { text?: string; content?: Node[] }
const paragraphs = computed(() =>
  ((post.value?.body as Node | null)?.content ?? []).map((block) =>
    (block.content ?? []).map((n) => n.text ?? '').join(''),
  ),
)
</script>

<template>
  <p v-if="error">Post not found. <NuxtLink to="/">Back</NuxtLink></p>
  <article v-else-if="post">
    <p v-if="post.status === 'draft'"><strong>Draft preview</strong></p>
    <h1>{{ post.title }}</h1>
    <p v-for="(text, i) in paragraphs" :key="i">{{ text }}</p>
  </article>
</template>
