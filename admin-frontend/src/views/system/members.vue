<route lang="yaml">
meta:
  title: 平台成员
  icon: ep:user
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
// 平台成员：管理 admin/manager/staff/agent/factory（不含 customer）
import Members from './users.vue'
</script>

<template>
  <Members />
</template>
