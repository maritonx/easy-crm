<script setup lang="ts">
import { t } from '../lib/i18n'
</script>

<template>
  <p class="notice">{{ t('common.notFound') }} <RouterLink to="/">{{ t('common.back') }}</RouterLink></p>
</template>
