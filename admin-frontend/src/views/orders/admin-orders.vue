<route lang="yaml">
meta:
  title: 订单管理
  icon: ep:ship
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus'
import OrdersAPI, { type AdminOrderItem } from '@/api/modules/orders'

const loading = ref(false)
const list = ref<AdminOrderItem[]>([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const status = ref<string>('')
const q = ref('')

const shipDialog = ref(false)
const shipFormRef = ref<FormInstance>()
const shipForm = ref<{ id?: number; tracking_no: string; logistics_provider: string }>({ tracking_no: '', logistics_provider: '' })

async function fetchData(){
  loading.value = true
  try{
    const { data } = await OrdersAPI.list({ page: page.value, limit: limit.value, status: status.value || undefined, q: q.value || undefined })
    list.value = data?.items || []
    total.value = data?.pagination?.total || 0
  } finally { loading.value = false }
}

function openShip(row: AdminOrderItem){
  if(row.status !== 'paid') return ElMessage.warning('仅已支付订单可发货')
  shipForm.value = { id: row.id, tracking_no: '', logistics_provider: '' }
  shipDialog.value = true
}

async function submitShip(){
  if(!shipForm.value.id) return
  if(!shipForm.value.tracking_no) return ElMessage.warning('请填写物流单号')
  try{
    await OrdersAPI.ship(shipForm.value.id, { tracking_no: shipForm.value.tracking_no, logistics_provider: shipForm.value.logistics_provider })
    ElMessage.success('已发货')
    shipDialog.value = false
    fetchData()
  }catch(e:any){ ElMessage.error(e?.message||'发货失败') }
}

async function markComplete(row: AdminOrderItem){
  if(row.status !== 'shipped') return ElMessage.warning('仅已发货订单可完成')
  await ElMessageBox.confirm('确认标记为已签收完成？','完成签收',{ type:'warning' })
  await OrdersAPI.complete(row.id)
  ElMessage.success('已完成')
  fetchData()
}

onMounted(fetchData)
</script>

<template>
  <div class="orders-page">
    <div class="toolbar">
      <el-input v-model="q" placeholder="搜索订单号" clearable style="width:220px" @keyup.enter="()=>{ page=1; fetchData() }" />
      <el-select v-model="status" placeholder="状态" clearable style="width:140px; margin-left:8px">
        <el-option label="全部" value="" />
        <el-option label="待支付" value="pending" />
        <el-option label="已支付" value="paid" />
        <el-option label="已发货" value="shipped" />
        <el-option label="已完成" value="completed" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-button type="primary" style="margin-left:8px" :loading="loading" @click="()=>{ page=1; fetchData() }">查询</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="id" label="#" width="70" />
      <el-table-column prop="order_no" label="订单号" width="180" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status==='paid'?'success':row.status==='shipped'?'warning':row.status==='completed'?'info':row.status==='cancelled'?'danger':'default'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="pay_amount" label="应付(元)" width="110" />
      <el-table-column prop="tracking_no" label="物流单号" width="180" />
      <el-table-column prop="logistics_provider" label="承运商" width="120" />
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button v-if="row.status==='paid'" size="small" type="primary" @click="openShip(row)">发货</el-button>
          <el-button v-if="row.status==='shipped'" size="small" type="success" @click="markComplete(row)">完成</el-button>
          <el-button size="small" @click="$router.push({ name:'adminOrderDetail', query:{ id: row.id } })">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div style="margin-top:12px; text-align:right">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="limit"
        :total="total"
        layout="prev, pager, next, sizes, jumper"
        @change="fetchData" />
    </div>

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
</style>
