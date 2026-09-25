<script setup lang="ts">
const { data: titles } = await useFetch<string[]>('/api/titles')
</script>

<template>
  <ul id="titles">
    <li v-for="title in titles" :key="title">{{ title }}</li>
  </ul>
</template>
