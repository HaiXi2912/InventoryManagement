<route lang="yaml">
meta:
  title: 订单详情
  icon: ep:document
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus'
import OrdersAPI, { type AdminOrderItem } from '@/api/modules/orders'

const route = useRoute()
const router = useRouter()

const id = ref<number>(0)

const loading = ref(false)
const detail = ref<AdminOrderItem | null>(null)

const shipDialog = ref(false)
const shipFormRef = ref<FormInstance>()
const shipForm = ref<{ tracking_no: string; logistics_provider: string }>({ tracking_no: '', logistics_provider: '' })

function ensureId(){
  const qid = Number(route.query.id)
  if (!Number.isNaN(qid) && qid > 0) { id.value = qid; return }
  const pid = Number(route.params.id)
  if(!Number.isNaN(pid) && pid>0){ id.value = pid; return }
  id.value = 0
}

async function fetchDetail(){
  ensureId()
  if(!id.value){
    ElMessage.warning('缺少订单ID')
    router.replace({ name: 'adminOrders' })
    return
  }
  loading.value = true
  try{
    const { data } = await OrdersAPI.detail(id.value)
    detail.value = data as AdminOrderItem
  } finally { loading.value = false }
}

function openShip(){
  if(!detail.value) return
  if(detail.value.status !== 'paid') return ElMessage.warning('仅已支付订单可发货')
  shipForm.value = { tracking_no: '', logistics_provider: '' }
  shipDialog.value = true
}

async function submitShip(){
  if(!id.value) return
  if(!shipForm.value.tracking_no) return ElMessage.warning('请填写物流单号')
  try{
    await OrdersAPI.ship(id.value, { tracking_no: shipForm.value.tracking_no, logistics_provider: shipForm.value.logistics_provider })
    ElMessage.success('已发货')
    shipDialog.value = false
    fetchDetail()
  }catch(e:any){ ElMessage.error(e?.message||'发货失败') }
}

async function markComplete(){
  if(!detail.value) return
  if(detail.value.status !== 'shipped') return ElMessage.warning('仅已发货订单可完成')
  await ElMessageBox.confirm('确认标记为已签收完成？','完成签收',{ type:'warning' })
  await OrdersAPI.complete(id.value)
  ElMessage.success('已完成')
  fetchDetail()
}

onMounted(fetchDetail)
</script>

<template>
  <div class="order-detail" v-loading="loading">
    <div class="toolbar">
      <el-button @click="router.back()">返回</el-button>
      <el-button v-if="detail?.status==='paid'" type="primary" @click="openShip">发货</el-button>
      <el-button v-if="detail?.status==='shipped'" type="success" @click="markComplete">完成签收</el-button>
    </div>

    <el-card v-if="detail" class="mb12">
      <template #header>
        <div class="card-header">
          <div>
            <div class="title">订单号：{{ detail.order_no }}</div>
            <div class="sub">
              状态：
              <el-tag :type="detail.status==='paid'?'success':detail.status==='shipped'?'warning':detail.status==='completed'?'info':detail.status==='cancelled'?'danger':'default'">{{ detail.status }}</el-tag>
              <span style="margin-left:12px">应付金额：￥{{ detail.pay_amount }}</span>
            </div>
          </div>
        </div>
      </template>
      <div class="grid2">
        <div>
          <div class="section-title">收货信息</div>
          <div class="field">姓名：{{ detail.address?.name || '-' }}</div>
          <div class="field">电话：{{ detail.address?.phone || '-' }}</div>
          <div class="field">地址：{{ detail.address?.full || detail.address?.detail || '-' }}</div>
        </div>
        <div>
          <div class="section-title">物流信息</div>
          <div class="field">承运商：{{ detail.logistics_provider || '-' }}</div>
          <div class="field">物流单号：{{ detail.tracking_no || '-' }}</div>
          <div class="field">发货时间：{{ detail.shipped_at || '-' }}</div>
          <div class="field">签收时间：{{ detail.delivered_at || '-' }}</div>
        </div>
      </div>
    </el-card>

    <el-card v-if="detail">
      <template #header>
        <div class="title">商品明细</div>
      </template>
      <el-table :data="detail.items || []" border>
        <el-table-column prop="name" label="商品" min-width="200" />
        <el-table-column prop="sku_id" label="SKU" width="100" />
        <el-table-column prop="size" label="尺码" width="90" />
        <el-table-column prop="color" label="颜色" width="90" />
        <el-table-column prop="price" label="单价" width="100" />
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column prop="amount" label="金额" width="120" />
      </el-table>
    </el-card>

    <el-dialog v-model="shipDialog" title="订单发货" width="460px">
      <el-form :model="shipForm" ref="shipFormRef" label-width="100px">
        <el-form-item label="物流单号" required>
          <el-input v-model="shipForm.tracking_no" placeholder="填写物流单号" />
        </el-form-item>
        <el-form-item label="承运商">
          <el-input v-model="shipForm.logistics_provider" placeholder="如：顺丰/中通/圆通" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipDialog=false">取消</el-button>
        <el-button type="primary" @click="submitShip">确定发货</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar{ display:flex; align-items:center; gap:8px; margin-bottom:12px; }
.mb12{ margin-bottom:12px; }
.card-header{ display:flex; align-items:center; justify-content:space-between; }
.title{ font-size:16px; font-weight:600; }
.sub{ color:#666; margin-top:6px; }
.section-title{ font-weight:600; margin-bottom:6px; }
.field{ color:#444; line-height:1.8; }
.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
</style>
