<template>
  <div class="cart" v-loading="loading">
    <h2>购物车</h2>
    <el-table :data="details" v-if="details.length" border>
      <el-table-column label="商品" min-width="260">
        <template #default="{ row }">
          <div class="item">
            <img :src="row.image" />
            <div>
              <div class="name">{{ row.name }}</div>
              <div class="spec">{{ row.size }} / {{ row.color }} （条码：{{ row.barcode }}）</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="price" label="单价" width="120" />
      <el-table-column label="数量" width="160">
        <template #default="{ row }">
          <el-input-number v-model="row.quantity" :min="1" :max="row.available" @change="onQtyChange(row)" />
        </template>
      </el-table-column>
      <el-table-column prop="amount" label="小计" width="140" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button type="text" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-else description="购物车空空如也" />

    <div class="footer" v-if="details.length">
      <div class="total">合计：¥{{ total }}</div>
      <el-button type="primary" @click="goCheckout">去结算</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useCartStore } from '@/stores/cart'
import http from '@/api/http'

const router = useRouter()
const cart = useCartStore()
const loading = ref(false)

interface Row { sku_id:number; product_id:number; name:string; size:string; color:string; barcode:string; image:string; price:number; quantity:number; available:number; amount:number }
const details = ref<Row[]>([])

function onQtyChange(row: Row){
  if(row.quantity > row.available){
    row.quantity = row.available
    ElMessage.warning('超过可售库存')
  }
  row.amount = +(row.quantity * row.price).toFixed(2)
  // 同步回本地购物车
  const item = cart.items.find(i=>i.sku_id===row.sku_id)
  if(item) item.quantity = row.quantity
  localStorage.setItem('cart', JSON.stringify(cart.items))
}

function remove(row: Row){
  cart.remove(row.sku_id)
  details.value = details.value.filter(r=>r.sku_id!==row.sku_id)
}

const total = computed(()=> details.value.reduce((a,b)=> a + b.amount, 0).toFixed(2))

async function load(){
  loading.value = true
  try {
    // 批量查询购物车中 SKU 详情
    const list: Row[] = []
    for(const it of cart.items){
      const { data } = await http.get(`/api/catalog/sku/${it.sku_id}`)
      if(data?.success){
        const { sku, product } = data.data
        const image = product?.media?.find?.((m:any)=>m.is_main)?.url || product?.image_url || 'https://via.placeholder.com/120x120?text=SKU'
        const available = Math.max(0, Number(sku.stock) - Number(sku.locked_stock || 0))
        const quantity = Math.min(available || 0, it.quantity)
        list.push({
          sku_id: sku.id,
          product_id: sku.product_id,
          name: product?.name || '',
          size: sku.size,
          color: sku.color,
          barcode: sku.barcode,
          image,
          price: Number(sku.retail_price||0),
          quantity,
          available,
          amount: +(Number(sku.retail_price||0) * Number(quantity)).toFixed(2),
        })
      }
    }
    details.value = list
  } finally { loading.value = false }
}

function goCheckout(){
  router.push('/checkout')
}

onMounted(load)
</script>

<style scoped>
.cart{ max-width: 1000px; margin: 20px auto; }
.item{ display:flex; gap:12px; align-items:center; }
.item img{ width:72px; height:72px; object-fit:cover; border-radius:6px; }
.name{ font-weight:600; }
.spec{ color:#909399; font-size:12px; }
.footer{ display:flex; justify-content:flex-end; align-items:center; gap:16px; margin-top:16px; }
.total{ font-size:18px; color:#F56C6C; font-weight:700; }
</style>
