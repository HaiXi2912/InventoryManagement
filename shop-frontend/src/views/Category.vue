<template>
  <div class="category" v-loading="loading">
    <div class="header">
      <h2>分类：{{ category }}</h2>
      <div class="tools">
        <el-input v-model="q" placeholder="搜索本类商品" style="width:240px" @keyup.enter="reload" />
        <el-select v-model="sort" placeholder="排序" style="width:180px" @change="reload">
          <el-option label="默认" value="" />
          <el-option label="价格升序" value="price-asc" />
          <el-option label="价格降序" value="price-desc" />
        </el-select>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col v-for="p in items" :key="p.id" :xs="12" :sm="8" :md="6" :lg="4">
        <el-card :body-style="{ padding: '0px' }" class="product-card" shadow="hover">
          <img :src="p.image" class="product-image" @click="view(p.id)" />
          <div class="product-info">
            <span class="product-name" @click="view(p.id)">{{ p.name }}</span>
            <div class="product-price"><span class="current-price">¥{{ p.price }}</span></div>
            <div class="product-actions">
              <el-button size="small" type="primary" @click="view(p.id)">查看详情</el-button>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="limit"
        :total="total"
        :page-sizes="[12,24,48,96]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="reload"
        @current-change="reload"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import http from '@/api/http'

const router = useRouter()
const route = useRoute()
const category = ref<string>(String(route.params.category||''))
const loading = ref(false)
const q = ref('')
const sort = ref('')
const page = ref(1)
const limit = ref(12)
const items = ref<any[]>([])
const total = ref(0)

async function reload(){
  loading.value = true
  try{
    const params:any = { page: page.value, limit: limit.value, category: category.value }
    if(q.value) params.q = q.value
    if(sort.value) params.sort = sort.value
    const { data } = await http.get('/api/catalog', { params })
    if(data?.success){
      items.value = (data.data?.items||[]).map((p:any)=>({
        id:p.id,
        name:p.name,
        price:p.retail_price,
        image: p.media?.find?.((m:any)=>m.is_main)?.url || p.image_url || 'https://via.placeholder.com/300x300?text=Product',
      }))
      total.value = data.data?.pagination?.total || items.value.length
    }
  } finally { loading.value = false }
}

function view(id:number){ router.push(`/product/${id}`) }

watch(()=>route.params.category, (v)=>{ category.value=String(v||''); page.value=1; reload() })

onMounted(reload)
</script>

<style scoped>
.category{ max-width:1200px; margin:20px auto; padding:0 10px }
.header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:12px }
.tools{ display:flex; gap:8px; align-items:center }
.product-card{ margin-bottom:20px; border-radius:12px; overflow:hidden }
.product-image{ width:100%; height:200px; object-fit:cover; cursor:pointer }
.product-info{ padding:10px }
.product-name{ display:block; font-weight:600; margin-bottom:6px; cursor:pointer }
.product-price{ color:#F56C6C; font-weight:700 }
.pagination-wrapper{ display:flex; justify-content:center; margin-top:16px }
</style>
