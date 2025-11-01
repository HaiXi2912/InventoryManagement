<route lang="yaml">
meta:
  title: 用户登录
  constant: true
  layout: false
</route>

<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { UserFilled, Lock, Message } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/modules/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// 表单引用
const loginFormRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()

// 当前模式
const isLogin = ref(true)

// 登录表单数据
const loginForm = reactive({
  username: 'admin',
  password: '123456',
  remember: false
})

// 注册表单数据
const registerForm = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  agree: false
})

// 加载状态
const loading = ref(false)

// 登录表单验证规则
const loginRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度为3-20个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度为6-20个字符', trigger: 'blur' }
  ]
}

// 注册表单验证规则
const registerRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度为3-20个字符', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱地址', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度为6-20个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== registerForm.password) {
          callback(new Error('两次输入密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  agree: [
    {
      validator: (_rule, value, callback) => {
        if (!value) {
          callback(new Error('请同意用户协议'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ]
}

// 切换登录/注册模式
const switchMode = () => {
  isLogin.value = !isLogin.value
  // 重置表单
  if (isLogin.value) {
    registerFormRef.value?.resetFields()
  } else {
    loginFormRef.value?.resetFields()
  }
}

// 处理登录
const handleLogin = async () => {
  if (!loginFormRef.value) return
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        // 调用真实后端登录接口
        await userStore.login({
          account: loginForm.username,
          password: loginForm.password
        })
        const role = (userStore as any).role || localStorage.getItem('role')
        const redirect = role === 'agent' ? '/cs/workbench' : ((route.query.redirect as string) || '/')
        ElMessage.success('登录成功，正在跳转...')
        router.replace(redirect)
      } catch (error) {
        ElMessage.error('登录失败，请检查用户名和密码')
      } finally {
        loading.value = false
      }
    }
  })
}

// 处理注册
const handleRegister = async () => {
  if (!registerFormRef.value) return
  await registerFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        await userStore.register({
          username: registerForm.username,
          email: registerForm.email,
          password: registerForm.password
        })
        ElMessage.success('注册成功！请登录')
        isLogin.value = true
        await nextTick()
        loginForm.username = registerForm.username
      } catch (error: any) {
        ElMessage.error(error?.message || '注册失败，请稍后重试')
      } finally {
        loading.value = false
      }
    }
  })
}

// 快速登录
const quickLogin = (role: string) => {
  if (role === 'admin') {
    loginForm.username = 'admin'
    loginForm.password = '123456'
  } else if (role === 'manager') {
    loginForm.username = 'manager'
    loginForm.password = '123456'
  } else if (role === 'agent') {
    loginForm.username = 'agent1'
    loginForm.password = '123456'
  }
}

// 忘记密码
const forgotPassword = () => {
  ElMessage.info('请联系系统管理员重置密码')
}
</script>

<template>
  <div class="login-container">
    <!-- 背景装饰 -->
    <div class="login-background">
      <div class="bg-shapes">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
        <div class="shape shape-3"></div>
      </div>
    </div>

    <!-- 登录表单区域 -->
    <div class="login-content">
      <div class="login-card">
        <!-- 头部标题 -->
        <div class="login-header">
          <div class="logo">
            <FaIcon name="i-ep:shop" size="40" color="#409EFF" />
          </div>
          <h1>进销存管理系统</h1>
          <p>{{ isLogin ? '欢迎回来' : '创建新账户' }}</p>
        </div>

        <!-- 表单切换标签 -->
        <div class="form-tabs">
          <button 
            :class="['tab-btn', { active: isLogin }]" 
            @click="isLogin = true"
          >
            登录
          </button>
          <button 
            :class="['tab-btn', { active: !isLogin }]" 
            @click="isLogin = false"
          >
            注册
          </button>
        </div>

        <!-- 登录表单 -->
        <div v-if="isLogin" class="form-container">
          <el-form
            ref="loginFormRef"
            :model="loginForm"
            :rules="loginRules"
            size="large"
            @submit.prevent="handleLogin"
          >
            <el-form-item prop="username">
              <el-input
                v-model="loginForm.username"
                placeholder="请输入用户名"
                :prefix-icon="UserFilled"
                clearable
              />
            </el-form-item>
            
            <el-form-item prop="password">
              <el-input
                v-model="loginForm.password"
                type="password"
                placeholder="请输入密码"
                :prefix-icon="Lock"
                show-password
                clearable
              />
            </el-form-item>
            
            <el-form-item>
              <div class="form-options">
                <el-checkbox v-model="loginForm.remember">记住我</el-checkbox>
                <el-button type="primary" link @click="forgotPassword">
                  忘记密码？
                </el-button>
              </div>
            </el-form-item>
            
            <el-form-item>
              <el-button
                type="primary"
                size="large"
                style="width: 100%"
                :loading="loading"
                @click="handleLogin"
              >
                <FaIcon name="i-ep:user" />
                {{ loading ? '登录中...' : '登录' }}
              </el-button>
            </el-form-item>
          </el-form>

          <!-- 快速登录 -->
          <div class="quick-login">
            <p>快速登录：</p>
            <div class="quick-btns nowrap">
              <el-button size="small" @click="quickLogin('agent')">客服</el-button>
              <el-button size="small" @click="quickLogin('admin')">管理员</el-button>
              <el-button size="small" @click="quickLogin('manager')">店长</el-button>
            </div>
          </div>
        </div>

        <!-- 注册表单 -->
        <div v-else class="form-container">
          <el-form
            ref="registerFormRef"
            :model="registerForm"
            :rules="registerRules"
            size="large"
            @submit.prevent="handleRegister"
          >
            <el-form-item prop="username">
              <el-input
                v-model="registerForm.username"
                placeholder="请输入用户名"
                :prefix-icon="UserFilled"
                clearable
              />
            </el-form-item>
            
            <el-form-item prop="email">
              <el-input
                v-model="registerForm.email"
                placeholder="请输入邮箱地址"
                :prefix-icon="Message"
                clearable
              />
            </el-form-item>
            
            <el-form-item prop="password">
              <el-input
                v-model="registerForm.password"
                type="password"
                placeholder="请输入密码"
                :prefix-icon="Lock"
                show-password
                clearable
              />
            </el-form-item>
            
            <el-form-item prop="confirmPassword">
              <el-input
                v-model="registerForm.confirmPassword"
                type="password"
                placeholder="请确认密码"
                :prefix-icon="Lock"
                show-password
                clearable
              />
            </el-form-item>
            
            <el-form-item prop="agree">
              <el-checkbox v-model="registerForm.agree">
                我已阅读并同意
                <el-button type="primary" link>《用户协议》</el-button>
                和
                <el-button type="primary" link>《隐私政策》</el-button>
              </el-checkbox>
            </el-form-item>
            
            <el-form-item>
              <el-button
                type="primary"
                size="large"
                style="width: 100%"
                :loading="loading"
                @click="handleRegister"
              >
                <FaIcon name="i-ep:user-plus" />
                {{ loading ? '注册中...' : '注册账户' }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 底部链接 -->
        <div class="login-footer">
          <p>
            {{ isLogin ? '还没有账户？' : '已有账户？' }}
            <el-button type="primary" link @click="switchMode">
              {{ isLogin ? '立即注册' : '立即登录' }}
            </el-button>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  overflow: hidden;
}

.login-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  
  .bg-shapes {
    position: relative;
    width: 100%;
    height: 100%;
    
    .shape {
      position: absolute;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      
      &.shape-1 {
        width: 300px;
        height: 300px;
        top: 10%;
        left: 10%;
        animation: float 6s ease-in-out infinite;
      }
      
      &.shape-2 {
        width: 200px;
        height: 200px;
        top: 60%;
        right: 15%;
        animation: float 8s ease-in-out infinite reverse;
      }
      
      &.shape-3 {
        width: 150px;
        height: 150px;
        bottom: 20%;
        left: 20%;
        animation: float 7s ease-in-out infinite;
      }
    }
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}

.login-content {
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  max-width: 600px;
  width: 100%;
  padding: 0 20px;
}

.login-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  width: 400px;
  max-width: 100%;
}

.login-header {
  text-align: center;
  margin-bottom: 25px;
  
  .logo {
    margin-bottom: 15px;
  }
  
  h1 {
    color: #303133;
    margin-bottom: 8px;
    font-size: 24px;
    font-weight: 600;
  }
  
  p {
    color: #606266;
    margin: 0;
    font-size: 14px;
  }
}

.form-tabs {
  display: flex;
  background: #f5f7fa;
  border-radius: 8px;
  padding: 3px;
  margin-bottom: 20px;
  
  .tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    padding: 10px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #606266;
    cursor: pointer;
    transition: all 0.3s ease;
    
    &.active {
      background: white;
      color: #409EFF;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    }
    
    &:hover {
      color: #409EFF;
    }
  }
}

.form-container {
  .form-options {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}

.quick-login {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #ebeef5;
  text-align: center;
  
  p {
    color: #606266;
    margin-bottom: 8px;
    font-size: 13px;
  }
  
  .quick-btns {
    display: flex;
    gap: 8px;
  }
}

.login-footer {
  text-align: center;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #ebeef5;
  
  p {
    color: #606266;
    margin: 0;
    font-size: 13px;
  }
}

// 响应式设计
@media (max-width: 768px) {
  .login-card {
    width: 100%;
    max-width: 350px;
    padding: 25px 20px;
  }
}

@media (max-width: 480px) {
  .login-card {
    padding: 20px 15px;
  }
  
  .login-header h1 {
    font-size: 20px;
  }
}
</style>
