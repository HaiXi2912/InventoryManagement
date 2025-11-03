<template>
  <div class="orders" v-loading="loading">
    <h2>我的订单</h2>
    <div class="toolbar">
      <el-button type="primary" @click="$router.push('/wallet')">我的钱包</el-button>
    </div>
    <el-table :data="list" border>
      <el-table-column prop="order_no" label="订单号" width="180" />
      <el-table-column prop="status" label="状态" width="120" />
      <el-table-column prop="pay_status" label="支付" width="120" />
      <el-table-column prop="total_amount" label="金额" width="120" />
      <el-table-column prop="logistics_provider" label="承运商" width="120" />
      <el-table-column prop="tracking_no" label="物流单号" width="180" />
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
          <el-button type="text" @click="view(row)">详情</el-button>
          <el-button type="text" v-if="row.status==='pending'" @click="pay(row)">去支付</el-button>
          <el-button type="text" v-if="row.status==='shipped'" @click="confirm(row)">确认收货</el-button>
          <el-button type="text" v-if="row.status!=='shipped' && row.status!=='completed' && row.status!=='cancelled'" @click="cancel(row)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'

const router = useRouter()
const loading = ref(false)
const list = ref<any[]>([])

async function load(){
  loading.value = true
  try {
    const { data } = await http.get('/api/orders')
    if(data?.success){ list.value = data.data || [] }
  } finally { loading.value = false }
}
function view(row:any){ router.push(`/orders/${row.id}`) }
async function cancel(row:any){
  await ElMessageBox.confirm('确定取消该订单？','提示')
  const { data } = await http.post(`/api/orders/${row.id}/cancel`)
  if(data?.success){ ElMessage.success('已取消'); load() }
}
async function pay(row:any){
  try{
    // 获取我的钱包余额
    const w = await http.get('/api/wallet/me').then(r=>r.data?.data)
    const balance = Number(w?.balance||0)
    const need = Number(row.pay_amount||row.total_amount||0)
    const me = await http.get('/api/auth/me').then(r=>r.data?.data)
    const uid = me?.id
    const body = (uid && balance >= need) ? { customer_id: uid } : undefined
    const { data } = await http.post(`/api/orders/${row.id}/pay`, body as any)
    if(data?.success){ ElMessage.success('支付成功'); load() }
  }catch(e:any){ ElMessage.error(e?.message||'支付失败') }
}
async function confirm(row:any){
  try{
    await ElMessageBox.confirm('确认已收到货物？','确认收货',{ type:'warning' })
    const { data } = await http.post(`/api/orders/${row.id}/confirm`)
    if(data?.success){ ElMessage.success('已确认收货'); load() }
  }catch(e:any){ if(e?.message && e?.message!=='cancel'){ ElMessage.error(e?.message) } }
}

onMounted(load)
</script>

<style scoped>
.orders{ max-width: 1000px; margin: 20px auto; }
.toolbar{ display:flex; justify-content:flex-end; margin-bottom:12px }
</style>
