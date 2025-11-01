<template>
  <div class="auth">
    <el-card class="auth-card" shadow="never">
      <template #header>注册</template>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="平台ID" prop="username">
          <el-input v-model.trim="form.username" placeholder="仅英数字/._-，4-32 位" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model.trim="form.email" placeholder="name@example.com" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="submit" :loading="loading">注册</el-button>
          <el-button link @click="$router.push('/login')">去登录</el-button>
        </el-form-item>
        <div class="tips">平台ID禁止中文，用于登录和识别；注册成功后将生成客户编码（如 CU000123）。</div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, FormInstance, FormRules } from 'element-plus'
import http from '@/api/http'

const router = useRouter()
const loading = ref(false)
const formRef = ref<FormInstance>()
const form = ref({ username:'', email:'', password:'' })

const rules: FormRules = {
  username: [
    { required: true, message: '请输入平台ID', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]{3,31}$/ , message: '仅英数字/._-，长度4-32', trigger: ['blur','change'] },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: ['blur','change'] }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '至少6位', trigger: ['blur','change'] }
  ]
}

async function submit(){
  try{
    await formRef.value?.validate()
  }catch{ return }

  loading.value = true
  try {
    const payload = { ...form.value, username: form.value.username.trim() }
    const { data } = await http.post('/api/auth/register', payload)
    if(data?.success){
      ElMessage.success('注册成功，请登录')
      router.push('/login')
    } else {
      ElMessage.error(data?.message || '注册失败')
    }
  } catch (e:any) {
    const msg = e?.response?.data?.message || e?.message || '注册失败'
    ElMessage.error(msg)
  } finally { loading.value = false }
}
</script>

<style scoped>
.auth{ display:flex; justify-content:center; align-items:center; min-height:60vh; }
.auth-card{ width:420px; }
.tips{ color:#909399; font-size:12px; margin-top:8px; }
</style>
