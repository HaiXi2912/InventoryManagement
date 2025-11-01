<template>
  <div>
    <!-- 头部导航 -->
    <header>
      <div class="logo" @click="goHome">MyShop</div>
      <nav>
        <ul>
          <li @click="goHome">首页</li>
          <li @click="goCategory">分类</li>
          <li @click="goCart">购物车</li>
          <li @click="goUser">个人中心</li>
        </ul>
      </nav>
      <div class="user-actions">
        <el-button @click="handleLogin" type="text">
          <User />
          <span v-if="!auth.isLogin">登录</span>
          <span v-else>{{ auth.userInfo.name }}</span>
        </el-button>
        <el-button @click="goCart" type="text">
          <ShoppingCart />
          <span class="badge" v-if="cart.totalItems">{{ cart.totalItems }}</span>
        </el-button>
        <el-button @click="goChat" type="text">
          <ChatDotRound />
        </el-button>
      </div>
    </header>

    <!-- 主体内容 -->
    <main>
      <router-view />
    </main>

    <!-- 底部版权 -->
    <footer>
      <div>© 2023 MyShop. All rights reserved.</div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Search, ShoppingCart, User, ChatDotRound } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useCartStore } from '@/stores/cart'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const cart = useCartStore()
const auth = useAuthStore()

// 登录处理
const handleLogin = () => {
  if(auth.isLogin){ auth.logout(); ElMessage.success('已退出'); return }
  router.push('/login')
}

// 路由跳转
const goHome = () => { router.push('/') }
const goCategory = () => { router.push('/category') }
const goCart = () => { router.push('/cart') }
const goUser = () => { router.push('/user') }
const goChat = () => { router.push('/chat') }

// 轮询未读消息
let interval = null
onMounted(() => {
  auth.fetchUnreadCount()
  interval = setInterval(() => {
    auth.fetchUnreadCount()
  }, 5000)
})
onBeforeUnmount(() => {
  clearInterval(interval)
})
</script>

<style scoped>
/* 添加一些基础样式 */
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background-color: #fff;
  border-bottom: 1px solid #eaeaea;
}

.logo {
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
}

nav ul {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
}

nav ul li {
  margin: 0 15px;
  cursor: pointer;
}

.user-actions {
  display: flex;
  align-items: center;
}

.badge {
  background-color: red;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  margin-left: 5px;
}

footer {
  text-align: center;
  padding: 20px;
  background-color: #f8f8f8;
  border-top: 1px solid #eaeaea;
}
</style>