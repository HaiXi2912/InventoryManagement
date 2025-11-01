<route lang="yaml">
meta:
  title: 我的资料
</route>

<script setup lang="ts">
const userStore = useUserStore()
</script>

<template>
  <div style="padding:12px;">
    <el-descriptions title="客服资料" :column="2" border>
      <el-descriptions-item label="用户名">{{ userStore.account }}</el-descriptions-item>
      <el-descriptions-item label="角色">{{ userStore.role || 'agent' }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>
