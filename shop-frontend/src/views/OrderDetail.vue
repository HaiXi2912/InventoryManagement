<template>
  <div class="order-detail" v-loading="loading">
    <h2>订单详情</h2>
    <div class="toolbar">
      <el-button @click="$router.back()">返回</el-button>
      <el-button v-if="order?.status==='shipped'" type="success" @click="confirm">确认收货</el-button>
    </div>
    <el-descriptions v-if="order" :column="2" border>
      <el-descriptions-item label="订单号">{{ order.order_no }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ order.status }}</el-descriptions-item>
      <el-descriptions-item label="支付">{{ order.pay_status }}</el-descriptions-item>
      <el-descriptions-item label="金额">¥{{ order.total_amount }}</el-descriptions-item>
      <el-descriptions-item label="承运商">{{ order.logistics_provider || '-' }}</el-descriptions-item>
      <el-descriptions-item label="物流单号">{{ order.tracking_no || '-' }}</el-descriptions-item>
      <el-descriptions-item label="发货时间">{{ order.shipped_at || '-' }}</el-descriptions-item>
      <el-descriptions-item label="签收时间">{{ order.delivered_at || '-' }}</el-descriptions-item>
    </el-descriptions>

    <el-card v-if="order?.address" style="margin-top:16px" shadow="never">
      <template #header>收货地址</template>
      {{ order.address.receiver_name }} / {{ order.address.phone }} / {{ order.address.province }}{{ order.address.city }}{{ order.address.district }} {{ order.address.detail }}
    </el-card>

    <el-card style="margin-top:16px" shadow="never">
      <template #header>商品</template>
      <el-table :data="order?.items || []" border size="small">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="size" label="尺码" width="100" />
        <el-table-column prop="color" label="颜色" width="100" />
        <el-table-column prop="barcode" label="条码" width="160" />
        <el-table-column prop="price" label="单价" width="120" />
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column prop="amount" label="小计" width="120" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'

const route = useRoute()
const loading = ref(false)
const order = ref<any>(null)

async function load(){
  loading.value = true
  try {
    const id = route.params.id
    const { data } = await http.get(`/api/orders/${id}`)
    if(data?.success){ order.value = data.data }
  } finally { loading.value = false }
}

async function confirm(){
  try{
    await ElMessageBox.confirm('确认已收到货物？','确认收货',{ type:'warning' })
    const { data } = await http.post(`/api/orders/${order.value.id}/confirm`)
    if(data?.success){ ElMessage.success('已确认收货'); await load() }
  }catch(e:any){ if(e?.message && e?.message!=='cancel'){ ElMessage.error(e?.message) } }
}

onMounted(load)
</script>

<style scoped>
.order-detail{ max-width: 1000px; margin: 20px auto; }
.toolbar{ display:flex; gap:8px; margin-bottom:12px }
</style>
