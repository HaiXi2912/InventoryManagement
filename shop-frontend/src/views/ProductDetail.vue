<template>
  <div class="product-detail" v-if="product">
    <el-row :gutter="20">
      <el-col :md="10" :sm="24">
        <el-carousel height="360px" trigger="click" v-if="(product.media||[]).length">
          <el-carousel-item v-for="m in product.media || []" :key="m.id">
            <img :src="m.url" class="detail-image" />
          </el-carousel-item>
        </el-carousel>
        <img v-else class="detail-image" src="https://via.placeholder.com/600x360?text=Product" />
      </el-col>
      <el-col :md="14" :sm="24">
        <h2>{{ product.name }}</h2>
        <div class="price">
          ¥{{ currentPrice }}
          <span v-if="strikePrice" class="strike">¥{{ strikePrice }}</span>
        </div>
        <div class="specs" v-if="sizes.length">
          <div class="spec-row">
            <span class="label">尺码：</span>
            <el-check-tag v-for="s in sizes" :key="s" :checked="selectedSize === s" @change="() => selectSize(s)" class="spec-tag">{{ s }}</el-check-tag>
          </div>
        </div>
        <div class="stock">
          库存：
          <span v-if="sizes.length && selectedSku">{{ availableStock }}</span>
          <span v-else-if="!sizes.length">现货</span>
          <span v-else>请选择尺码</span>
        </div>
        <div class="actions">
          <el-input-number v-model="qty" :min="1" :max="availableStock || 99" />
          <el-button type="primary" @click="addToCart" :disabled="sizes.length && !selectedSku">加入购物车</el-button>
          <el-button @click="buyNow" :disabled="sizes.length && !selectedSku">立即购买</el-button>
        </div>
      </el-col>
    </el-row>

    <el-card class="sku-matrix" shadow="never" v-if="sizes.length">
      <template #header>
        <div class="card-header">各尺码库存</div>
      </template>
      <el-table :data="sizeStocks" border size="small">
        <el-table-column prop="size" label="尺码" width="100" />
        <el-table-column prop="stock" label="可用库存" width="120" align="right" />
      </el-table>
    </el-card>

    <el-card class="content" shadow="never" v-if="product.content?.mobile_html || product.content?.rich_html">
      <template #header><div class="card-header">商品详情</div></template>
      <div v-html="product.content?.mobile_html || product.content?.rich_html" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useCartStore } from '@/stores/cart'

const route = useRoute()
const router = useRouter()
const cart = useCartStore()

const id = Number(route.params.id)
const product = ref<any>(null)
const qty = ref(1)
const selectedSize = ref<string>('')

const sizes = computed<string[]>(() => {
  const set = new Set((product.value?.skus || []).map((s: any) => s.size).filter(Boolean))
  return Array.from(set)
})

const selectedSku = computed(() => {
  if(!sizes.value.length) return null
  return (product.value?.skus || []).find((s: any) => s.size === selectedSize.value) || null
})

const availableStock = computed(() => {
  const s = selectedSku.value
  return s ? Math.max(0, Number(s.stock) - Number(s.locked_stock || 0)) : 99
})

const currentPrice = computed(() => {
  const s = selectedSku.value
  return s?.retail_price ?? product.value?.retail_price ?? 0
})

const strikePrice = computed(() => {
  const s = selectedSku.value
  return s?.tag_price ?? product.value?.tag_price ?? null
})

// 尺码-库存表数据
const sizeStocks = computed(() => {
  const list: Array<{ size: string; stock: number }> = []
  for (const s of product.value?.skus || []) {
    const size = s.size || '-'
    const stock = Math.max(0, Number(s.stock) - Number(s.locked_stock || 0))
    const idx = list.findIndex(x => x.size === size)
    if (idx === -1) list.push({ size, stock })
    else list[idx].stock = stock
  }
  return list
})

function selectSize(s: string) { selectedSize.value = s }

function addToCart() {
  // 无SKU场景：临时用 product.id 作为 sku_id=0，不加入购物车，直接走立即购买到结算页（保持简单）
  if (sizes.value.length && !selectedSku.value) return
  if (selectedSku.value) {
    cart.add({ sku_id: selectedSku.value.id, quantity: qty.value })
  }
  else {
    ElMessage.warning('该商品未配置SKU，请联系管理员完善尺码规格')
    return
  }
  ElMessage.success('已加入购物车')
}
function buyNow() {
  addToCart()
  router.push('/cart')
}

async function load() {
  const { data } = await http.get(`/api/catalog/${id}`)
  if (!data?.success) return
  product.value = data.data
  const first = (product.value.skus || [])[0]
  if (first && first.size) { selectedSize.value = first.size }
}

onMounted(load)
</script>

<style scoped>
.product-detail { max-width: 1200px; margin: 20px auto; }
.detail-image { width: 100%; height: 360px; object-fit: cover; }
.price { color: #F56C6C; font-size: 24px; font-weight: 700; margin: 10px 0 20px; }
.strike { color: #909399; text-decoration: line-through; margin-left: 8px; font-size: 14px }
.specs { margin: 10px 0 16px; }
.spec-row { margin-bottom: 10px; display: flex; align-items: center; flex-wrap: wrap; }
.label { width: 56px; color: #606266; }
.spec-tag { margin-right: 8px; margin-bottom: 8px; }
.actions { display:flex; gap: 10px; align-items: center; margin-top: 10px; }
.sku-matrix { margin-top: 20px; }
.content { margin-top: 20px; }
</style>
