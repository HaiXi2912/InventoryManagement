<template>
  <div class="auth">
    <el-card class="auth-card" shadow="never">
      <template #header>登录</template>
      <el-form :model="form" label-width="80px">
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" /></el-form-item>
        <el-form-item>
          <el-button type="primary" @click="submit" :loading="loading">登录</el-button>
          <el-button link @click="$router.push('/register')">去注册</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const form = ref({ username:'', password:'' })

async function submit(){
  loading.value = true
  try {
    const { data } = await http.post('/api/auth/login', form.value)
    if(data?.success){
      auth.setToken(data.data.token)
      // 兼容本地
      localStorage.setItem('token', data.data.token)
      ElMessage.success('登录成功')
      const redirect = typeof route.query.redirect === 'string' && route.query.redirect ? route.query.redirect : '/'
      router.replace(redirect)
    }
  } finally { loading.value = false }
}
</script>

<style scoped>
.auth{ display:flex; justify-content:center; align-items:center; min-height:60vh; }
.auth-card{ width:420px; }
</style>
