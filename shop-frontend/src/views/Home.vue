<template>
  <div class="home" v-loading="loading">
    <!-- 轮播图 -->
    <el-carousel height="400px" class="banner">
      <el-carousel-item v-for="item in banners" :key="item.id">
        <div class="banner-item" :style="{ backgroundColor: item.color }">
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
          <el-button type="primary" size="large" @click="$router.push('/products')">立即选购服装</el-button>
        </div>
      </el-carousel-item>
    </el-carousel>

    <!-- 热门商品（真实销量Top） -->
    <div class="products-section">
      <div class="section-header">
        <h2>热销服装</h2>
        <el-button type="primary" @click="$router.push('/products')">查看更多</el-button>
      </div>
      <el-row :gutter="20">
        <el-col :xs="12" :sm="8" :md="6" :lg="4" v-for="product in hotProducts" :key="product.id">
          <el-card :body-style="{ padding: '0px' }" class="product-card" shadow="hover">
            <img :src="product.image" class="product-image" @click="viewProduct(product.id)" />
            <div class="product-info">
              <span class="product-name" @click="viewProduct(product.id)">{{ product.name }}</span>
              <div class="product-price">¥{{ product.price }}</div>
              <div class="product-actions">
                <el-button size="small" type="primary" @click="viewProduct(product.id)">立即购买</el-button>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 新品推荐（最新上架） -->
    <div class="new-products-section">
      <div class="section-header">
        <h2>新品推荐</h2>
        <el-button type="success" @click="$router.push('/products?filter=new')">查看全部新品</el-button>
      </div>
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="8" v-for="product in newProducts" :key="product.id">
          <el-card class="new-product-card" shadow="hover">
            <el-row :gutter="20">
              <el-col :span="8"><img :src="product.image" class="new-product-image" @click="viewProduct(product.id)" /></el-col>
              <el-col :span="16">
                <div class="new-product-info">
                  <el-tag type="success" size="small">新品</el-tag>
                  <h4 @click="viewProduct(product.id)">{{ product.name }}</h4>
                  <div class="price-actions">
                    <span class="price">¥{{ product.price }}</span>
                    <el-button size="small" type="primary" @click="viewProduct(product.id)">查看详情</el-button>
                  </div>
                </div>
              </el-col>
            </el-row>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 优势特色（静态） -->
    <div class="features-section">
      <h2>购物优势</h2>
      <el-row :gutter="40">
        <el-col :xs="24" :sm="12" :md="6">
          <div class="feature-item">
            <h3>版型齐全</h3>
            <p>尺码覆盖广，满足多种身形</p>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="feature-item">
            <h3>面料优选</h3>
            <p>亲肤透气，穿着舒适</p>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="feature-item">
            <h3>发货迅速</h3>
            <p>48小时内快速发货</p>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="feature-item">
            <h3>售后无忧</h3>
            <p>支持7天无理由退换</p>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, ShoppingCart } from '@element-plus/icons-vue'
import http from '@/api/http'

const router = useRouter()
const loading = ref(false)

// 轮播（静态）
const banners = ref([
  { id: 1, title: '春夏上新', description: '精选面料，显瘦显高', color: '#409EFF' },
  { id: 2, title: '秋冬热卖', description: '保暖不臃肿，时尚有型', color: '#67C23A' },
  { id: 3, title: '限时钜惠', description: '人气款直降，入手不亏', color: '#E6A23C' }
])

const hotProducts = ref<any[]>([])
const newProducts = ref<any[]>([])

const features = ref([
  { id: 1, title: '品质保证', description: '正品保障，假一赔十', icon: 'Shield', color: '#67C23A' },
  { id: 2, title: '快速配送', description: '24小时内发货，极速到达', icon: 'Van', color: '#409EFF' },
  { id: 3, title: '贴心服务', description: '7×24小时客服在线', icon: 'Service', color: '#E6A23C' },
  { id: 4, title: '优惠价格', description: '天天低价，省钱到家', icon: 'Money', color: '#F56C6C' }
])

function viewProduct(id:number){ router.push(`/product/${id}`) }

async function loadHot(){
  const end = new Date(); const start = new Date(); start.setDate(end.getDate()-30)
  const pad = (n:number)=> String(n).padStart(2,'0')
  const fm = (d:Date)=> `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  try{
    const r = await http.get('/api/statistics/top-products', { params: { start_date: fm(start), end_date: fm(end), limit: 8 } })
    const list:any[] = []
    for(const row of (r.data?.data || [])){
      const pid = row.product_id
      const detail = await http.get(`/api/catalog/${pid}`).catch(()=>({ data: null }))
      if(detail?.data?.success){
        const p = detail.data.data
        list.push({ id: p.id, name: p.name, price: p.retail_price, image: p.media?.find?.((m:any)=>m.is_main)?.url || p.image_url || 'https://via.placeholder.com/300x300?text=Product' })
      }
    }
    hotProducts.value = list
  } catch { hotProducts.value = [] }
}

async function loadNew(){
  const r = await http.get('/api/catalog', { params: { page:1, limit:6 } })
  if(r.data?.success){
    newProducts.value = (r.data.data?.items || []).map((p:any)=>({ id:p.id, name:p.name, price:p.retail_price, image: p.media?.find?.((m:any)=>m.is_main)?.url || p.image_url || 'https://via.placeholder.com/150x100?text=Product', description: p.description||'' }))
  }
}

onMounted(async ()=>{
  loading.value = true
  try{ await Promise.all([loadHot(), loadNew()]) } finally { loading.value = false }
})
</script>

<style scoped lang="scss">
.home { min-height: 100vh; background-color: #f5f7fa; }
.banner { margin-bottom: 40px; }
.banner .banner-item { display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; color:#fff; text-align:center }
.banner .banner-item h3{ font-size:2.5rem; margin-bottom:10px; text-shadow:2px 2px 4px rgba(0,0,0,.3) }
.banner .banner-item p{ font-size:1.2rem; margin-bottom:30px; text-shadow:1px 1px 2px rgba(0,0,0,.3) }
.products-section, .new-products-section{ max-width:1200px; margin:0 auto 50px; padding:0 20px }
.section-header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:30px }
.product-card{ margin-bottom:20px; border-radius:12px; overflow:hidden }
.product-image{ width:100%; height:200px; object-fit:cover; cursor:pointer }
.product-info{ padding:12px }
.product-price{ color:#F56C6C; font-weight:700 }
.new-product-card{ margin-bottom:20px }
.new-product-image{ width:100%; height:120px; object-fit:cover; cursor:pointer }
.price-actions{ display:flex; justify-content:space-between; align-items:center; margin-top:6px }
.features-section{ max-width:1200px; margin:0 auto 50px; padding:0 20px }
.feature-item{ text-align:center }
</style>
