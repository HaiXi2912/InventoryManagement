<template>
  <div id="app">
    <!-- 顶部导航 -->
    <el-header class="header">
      <div class="header-container">
        <div class="logo" @click="$router.push('/')">
          <h2>时尚购物商城</h2>
        </div>
        <div class="nav-menu">
          <el-menu mode="horizontal" :ellipsis="false" router>
            <el-menu-item index="/" route="/">首页</el-menu-item>
            <el-menu-item index="/products" route="/products">全部商品</el-menu-item>
            <el-submenu index="categories">
              <template #title>商品分类</template>
              <el-menu-item index="/category/电子产品">电子产品</el-menu-item>
              <el-menu-item index="/category/服装配饰">服装配饰</el-menu-item>
              <el-menu-item index="/category/生活用品">生活用品</el-menu-item>
              <el-menu-item index="/category/食品饮料">食品饮料</el-menu-item>
              <el-menu-item index="/category/图书文具">图书文具</el-menu-item>
            </el-submenu>
            <el-menu-item index="/products?filter=new">新品上市</el-menu-item>
            <el-menu-item index="/products?filter=sale">特价促销</el-menu-item>
          </el-menu>
        </div>
        <div class="header-actions">
          <div class="search-box">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索商品..."
              style="width: 200px"
              @keyup.enter="handleSearch"
            >
              <template #append>
                <el-button :icon="Search" @click="handleSearch" />
              </template>
            </el-input>
          </div>
          <el-badge :value="cartCount" class="cart-badge" :hidden="cartCount === 0">
            <el-button :icon="ShoppingCart" @click="$router.push('/cart')">
              购物车
            </el-button>
          </el-badge>
          <el-button :icon="User" @click="handleLogin">登录</el-button>
        </div>
      </div>
    </el-header>

    <!-- 主要内容区 -->
    <el-main class="main-content">
      <router-view />
    </el-main>

    <!-- 底部 -->
    <el-footer class="footer">
      <div class="footer-content">
        <div class="footer-section">
          <h4>关于我们</h4>
          <p>专业的进销存管理系统</p>
          <p>提供完整的电商解决方案</p>
        </div>
        <div class="footer-section">
          <h4>客户服务</h4>
          <p>联系电话：400-123-4567</p>
          <p>服务时间：9:00-18:00</p>
        </div>
        <div class="footer-section">
          <h4>技术支持</h4>
          <p>Vue 3 + Element Plus</p>
          <p>现代化前端技术栈</p>
        </div>
        <div class="footer-section">
          <h4>关注我们</h4>
          <div class="social-links">
            <el-button link>微信</el-button>
            <el-button link>微博</el-button>
            <el-button link>抖音</el-button>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2025 时尚购物商城 - 进销存系统示例</p>
      </div>
    </el-footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, ShoppingCart, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()

// 搜索关键字
const searchKeyword = ref('')

// 购物车数量
const cartCount = ref(3)

// 搜索处理
const handleSearch = () => {
  if (searchKeyword.value.trim()) {
    router.push(`/products?search=${searchKeyword.value}`)
    ElMessage.success(`搜索：${searchKeyword.value}`)
  }
}

// 登录处理
const handleLogin = () => {
  ElMessage.info('登录功能开发中...')
}
</script>

<style scoped>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 1000;
}

.header-container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 20px;
}

.logo {
  cursor: pointer;
  transition: color 0.3s ease;
}

.logo h2 {
  margin: 0;
  color: #409EFF;
  font-size: 1.5rem;
}

.logo:hover h2 {
  color: #337ecc;
}

.nav-menu {
  flex: 1;
  margin: 0 40px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.search-box {
  display: flex;
  align-items: center;
}

.cart-badge {
  position: relative;
}

.main-content {
  flex: 1;
  padding: 0;
  background-color: #f5f7fa;
}

.footer {
  background-color: #303133;
  color: #fff;
  padding: 40px 0 0;
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 30px;
  padding: 0 20px 30px;
}

.footer-section h4 {
  margin-bottom: 15px;
  color: #409EFF;
}

.footer-section p {
  margin: 5px 0;
  color: #C0C4CC;
  line-height: 1.5;
}

.social-links {
  display: flex;
  gap: 10px;
}

.footer-bottom {
  border-top: 1px solid #409EFF;
  padding: 20px;
  text-align: center;
  background-color: #262729;
}

.footer-bottom p {
  margin: 0;
  color: #909399;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .header-container {
    padding: 0 15px;
  }
  
  .nav-menu {
    margin: 0 20px;
  }
  
  .search-box input {
    width: 150px !important;
  }
}

@media (max-width: 768px) {
  .header-container {
    flex-wrap: wrap;
    height: auto;
    padding: 10px 15px;
  }
  
  .logo {
    order: 1;
  }
  
  .header-actions {
    order: 2;
    gap: 10px;
  }
  
  .nav-menu {
    order: 3;
    width: 100%;
    margin: 10px 0 0;
  }
  
  .search-box {
    display: none;
  }
  
  .footer-content {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
}

@media (max-width: 480px) {
  .footer-content {
    grid-template-columns: 1fr;
    text-align: center;
  }
}
</style>
