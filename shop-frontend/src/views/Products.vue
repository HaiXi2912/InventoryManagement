<template>
  <div class="products">
    <div class="products-list">
      <div class="list-header">
        <div class="result-info">
          <span>共 {{ total }} 件服装</span>
        </div>
      </div>
      <div class="grid-view">
        <el-row :gutter="20">
          <el-col v-for="product in products" :key="product.id" :xs="12" :sm="8" :md="6" :lg="4">
            <el-card :body-style="{ padding: '0px' }" class="product-card" shadow="hover">
              <img :src="product.image" class="product-image" @click="viewProduct(product.id)" />
              <div class="product-info">
                <h4 class="product-name" @click="viewProduct(product.id)">{{ product.name }}</h4>
                <div class="product-price">¥{{ product.price }}</div>
                <div class="product-actions">
                  <el-button size="small" type="primary" @click="viewProduct(product.id)">查看详情</el-button>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>
      <div class="pagination-wrapper">
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[12, 24, 48, 96]" :total="total" layout="total, sizes, prev, pager, next, jumper" @size-change="handleSizeChange" @current-change="handleCurrentChange" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import http from '@/api/http'

const router = useRouter()
const route = useRoute()

const products = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(12)

function viewProduct(id:number){ router.push(`/product/${id}`) }

async function load(){
  const params:any = { page: currentPage.value, limit: pageSize.value }
  if(route.query.search) params.q = String(route.query.search)
  const { data } = await http.get('/api/catalog', { params })
  if(data?.success){
    products.value = (data.data?.items || []).map((p:any)=>({ id:p.id, name:p.name, price:p.retail_price, image: p.media?.find?.((m:any)=>m.is_main)?.url || p.image_url || 'https://via.placeholder.com/300x300?text=Product' }))
    total.value = data.data?.pagination?.total || products.value.length
  }
}

function handleSizeChange(size:number){ pageSize.value = size; currentPage.value = 1; load() }
function handleCurrentChange(page:number){ currentPage.value = page; load() }

onMounted(load)
</script>

<style scoped lang="scss">
.products { max-width: 1200px; margin: 0 auto; padding: 20px; }
.list-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px }
.grid-view .product-card{ margin-bottom:20px; border-radius:12px; overflow:hidden }
.product-image{ width:100%; height:200px; object-fit:cover; cursor:pointer }
.product-info{ padding:12px }
.product-name{ margin:0 0 8px; cursor:pointer }
.product-price{ color:#F56C6C; font-weight:700 }
.pagination-wrapper{ display:flex; justify-content:center; margin-top:30px }
</style>
