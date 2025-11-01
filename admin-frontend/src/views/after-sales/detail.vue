<route lang="yaml">
meta:
  title: 售后详情
</route>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'

const route = useRoute()
const id = Number(route.query.id || route.params.id)
const loading = ref(false)
const detail = ref<any>(null)
const exchangeTo = ref<any[]>([])

async function load() {
  loading.value = true
  try {
    const res:any = await api.get(`/after-sales/${id}`)
    detail.value = res.data
  } finally { loading.value = false }
}

async function inspect(pass: boolean) {
  loading.value = true
  try {
    await api.post(`/after-sales/${id}/inspect`, { passed: pass, remark: pass? '验货通过':'' })
    await load()
  } finally { loading.value = false }
}

async function complete() {
  loading.value = true
  try {
    let payload:any = {}
    if (detail.value?.type === 'exchange') payload.exchange_to = exchangeTo.value
    await api.post(`/after-sales/${id}/complete`, payload)
    await load()
  } finally { loading.value = false }
}

async function approve() {
  loading.value = true
  try {
    await api.post(`/after-sales/${id}/approve`, {})
    await load()
  } finally { loading.value = false }
}

onMounted(load)
</script>

<template>
  <div class="as-detail" v-loading="loading">
    <div class="title">售后 #{{ id }}</div>
    <div class="meta">
      <el-descriptions :column="4" size="small" border>
        <el-descriptions-item label="单号">{{ detail?.as_no }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ detail?.type }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag size="small">{{ detail?.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="退款金额">￥{{ detail?.refund_amount }}</el-descriptions-item>
        <el-descriptions-item label="客户">{{ detail?.customer_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="订单">{{ detail?.order_id }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detail?.remark }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detail?.created_at }}</el-descriptions-item>
      </el-descriptions>
    </div>

    <h4>商品明细</h4>
    <el-table :data="detail?.items||[]" size="small" border>
      <el-table-column prop="order_item_id" label="订单行ID" width="100" />
      <el-table-column prop="sku_id" label="SKU" width="100" />
      <el-table-column prop="quantity" label="数量" width="80" />
      <el-table-column prop="amount" label="金额" width="100" />
    </el-table>

    <div class="actions">
      <template v-if="detail?.status==='pending'">
        <el-button size="small" type="success" @click="inspect(true)" v-if="detail?.type!=='refund'">验货通过</el-button>
        <el-button size="small" type="danger" @click="inspect(false)" v-if="detail?.type!=='refund'">验货不通过</el-button>
        <el-button size="small" type="primary" @click="approve" v-if="detail?.type==='refund'">直接审批</el-button>
      </template>

      <template v-if="detail?.status==='approved'">
        <div v-if="detail?.type==='exchange'" class="exchange">
          <div class="sub">换货目标（仅同商品不同尺码）</div>
          <el-table :data="exchangeTo" size="small" border>
            <el-table-column label="from_item_id" prop="from_item_id" width="120"/>
            <el-table-column label="to_sku_id" prop="to_sku_id" width="120"/>
            <el-table-column label="quantity" prop="quantity" width="90"/>
            <el-table-column label="操作" width="100">
              <template #default="scope">
                <el-button link size="small" type="danger" @click="exchangeTo.splice(scope.$index,1)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="inline">
            <el-select v-model="(exchangeTo as any)._from" placeholder="选择来源行" size="small" style="width:160px">
              <el-option v-for="it in (detail?.items||[])" :key="it.id" :label="`行#${it.id}`" :value="it.id" />
            </el-select>
            <el-input v-model.number="(exchangeTo as any)._toSku" placeholder="目标SKU ID" size="small" style="width:160px" />
            <el-input-number v-model="(exchangeTo as any)._qty" :min="1" placeholder="数量" size="small" />
            <el-button size="small" @click="()=>{ const _=(exchangeTo as any); if(_. _from&&_._toSku&&_._qty){ exchangeTo.push({from_item_id: _._from, to_sku_id: _._toSku, quantity: _._qty}); _._from=null; _._toSku=null; _._qty=1 } }">添加</el-button>
          </div>
        </div>
        <el-button size="small" type="primary" @click="complete">完成售后</el-button>
      </template>

      <el-alert v-if="detail?.status==='completed'" title="该售后已完成" type="success" show-icon/>
      <el-alert v-else-if="detail?.status==='cancelled'" title="该售后已撤销" type="warning" show-icon/>
      <el-alert v-else-if="detail?.status==='rejected'" title="该售后已拒绝" type="error" show-icon/>
    </div>
  </div>
</template>

<style scoped>
.as-detail{ padding:10px; display:flex; flex-direction:column; gap:10px }
.title{ font-weight:700 }
.meta :deep(.el-descriptions__label){ width:80px }
.actions{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
.exchange{ display:flex; flex-direction:column; gap:6px; border:1px dashed #ddd; padding:8px; border-radius:6px; background:#fafafa }
.inline{ display:flex; gap:6px; align-items:center; flex-wrap:wrap }
</style>
