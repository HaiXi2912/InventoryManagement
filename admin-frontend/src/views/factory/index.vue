<route lang="yaml">
meta:
  title: 工厂看板
  icon: ep:office-building
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FactoryAPI from '@/api/modules/factory'

// 数据源
const loading = ref(false)
const dashboard = ref<any>({ status_stats:[], in_production:[], styles:[] })
const settings = ref<{ daily_capacity: number; work_hours_per_day: number }>({ daily_capacity: 100, work_hours_per_day: 12 })

const inProgressOrders = ref<any[]>([])
const approvedQueue = ref<any[]>([])
const recentDone = ref<any[]>([])

// 统计映射
const STATUS_TEXT: Record<string,string> = { planned:'计划中', approved:'已批准', in_production:'生产中', completed:'已完成', shipped:'确认入库', cancelled:'已取消' }
const statusText = (s?: string) => STATUS_TEXT[String(s||'')] || (s||'-')
const statusTagType = (s?: string) => ({ planned:'info', approved:'warning', in_production:'primary', completed:'success', shipped:'success', cancelled:'info' } as Record<string, any>)[String(s||'')] || 'info'

// 加载基础数据
const loadDashboard = async () => {
  loading.value = true
  try { const res = await FactoryAPI.dashboard(); dashboard.value = res?.data || dashboard.value } catch(e){ ElMessage.error('加载失败') } finally { loading.value=false }
}
const loadSettings = async () => { try { const r = await FactoryAPI.getSettings(); if (r?.data) settings.value = { daily_capacity: Number(r.data.daily_capacity||100), work_hours_per_day: Number(r.data.work_hours_per_day||12) } } catch {} }

// 订单分组加载
const loadInProgress = async () => { try { const r = await FactoryAPI.list({ page: 1, size: 100, status: 'in_production' }); inProgressOrders.value = (r?.data?.orders||[]).sort((a:any,b:any)=> new Date(a.expected_finish_at||a.createdAt).getTime() - new Date(b.expected_finish_at||b.createdAt).getTime()) } catch { inProgressOrders.value = [] } }
const loadApproved = async () => { try { const r = await FactoryAPI.list({ page: 1, size: 50, status: 'approved' }); approvedQueue.value = r?.data?.orders || [] } catch { approvedQueue.value = [] } }
const loadRecentDone = async () => { try { const r = await FactoryAPI.list({ page: 1, size: 10, status: 'completed' }); const r2 = await FactoryAPI.list({ page: 1, size: 10, status: 'shipped' }); recentDone.value = [...(r?.data?.orders||[]), ...(r2?.data?.orders||[])].slice(0,10) } catch { recentDone.value = [] } }

// KPI 统计
const statusCount = (key: string) => Number((dashboard.value.status_stats || []).find((s:any)=> s.status===key)?.cnt || 0)
const kpiPlanned = computed(()=> statusCount('planned'))
const kpiApproved = computed(()=> statusCount('approved'))
const kpiInProd  = computed(()=> statusCount('in_production'))
const kpiDone    = computed(()=> statusCount('completed') + statusCount('shipped'))

// 响应式时钟，用于驱动进度条流动
const nowTick = ref<number>(Date.now())
let tickTimer: any = null

// 进度计算
const pct = (row: any) => {
  if (!row?.production_started_at || !row?.expected_finish_at) return 0
  const start = new Date(row.production_started_at).getTime()
  const end = new Date(row.expected_finish_at).getTime()
  const now = nowTick.value
  if (end <= start) return 0
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.floor(((now - start) / (end - start)) * 100)
}

// 产能估算：当前在制总件数、预计总工时（粗略）
const inProgressQty = computed(()=> (inProgressOrders.value||[]).reduce((sum:number, o:any)=> sum + (Array.isArray(o.details) ? o.details.reduce((s:number,d:any)=> s + Number(d.quantity||0), 0) : 0), 0))
const estimatedHours = computed(()=> {
  const per = Math.max(1, settings.value.work_hours_per_day) / Math.max(1, settings.value.daily_capacity) // 每件耗时(小时)
  return Math.ceil(inProgressQty.value * per)
})
const estimatedDays = computed(()=> Math.ceil(estimatedHours.value / Math.max(1, settings.value.work_hours_per_day)))

// 操作
const changeStatus = async (row: any, action: 'complete'|'ship'|'start') => {
  try {
    const textMap: any = { complete:'完成', ship:'确认入库', start:'开工' }
    await ElMessageBox.confirm(`确定执行 ${textMap[action]} ?`, '提示', { type:'warning' })
    if (action==='complete') await FactoryAPI.complete(row.id)
    if (action==='ship') await FactoryAPI.ship(row.id)
    if (action==='start') await FactoryAPI.start(row.id)
    ElMessage.success('操作成功')
    refreshAll()
  } catch{}
}

// 刷新
const refreshAll = async () => { await Promise.all([loadDashboard(), loadInProgress(), loadApproved(), loadRecentDone(), loadSettings()]) }

let timer: any = null
onMounted(async()=>{ await refreshAll(); timer = setInterval(()=>{ loadInProgress(); loadApproved(); }, 15000); tickTimer = setInterval(()=>{ nowTick.value = Date.now() }, 1000) })
onUnmounted(()=>{ if (timer) clearInterval(timer); if (tickTimer) clearInterval(tickTimer) })
</script>

<template>
  <div class="p-4 space-y-4">
    <!-- KPI 总览 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <el-card shadow="hover"><div class="text-12 text-gray-500">计划中</div><div class="text-28 font-700">{{ kpiPlanned }}</div></el-card>
      <el-card shadow="hover"><div class="text-12 text-gray-500">已批准</div><div class="text-28 font-700">{{ kpiApproved }}</div></el-card>
      <el-card shadow="hover"><div class="text-12 text-gray-500">生产中</div><div class="text-28 font-700">{{ kpiInProd }}</div></el-card>
      <el-card shadow="hover"><div class="text-12 text-gray-500">已完成/入库</div><div class="text-28 font-700">{{ kpiDone }}</div></el-card>
    </div>

    <!-- 进行中订单（置顶进度卡片） -->
    <el-card v-if="inProgressOrders.length" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="font-600">进行中订单</div>
          <el-tag type="warning" size="small">每15秒自动刷新</el-tag>
        </div>
      </template>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <el-card v-for="o in inProgressOrders" :key="o.id" shadow="hover">
          <div class="flex items-center justify-between mb-2">
            <div class="font-600">{{ o.order_no }}</div>
            <el-tag :type="statusTagType(o.status)" size="small">{{ statusText(o.status) }}</el-tag>
          </div>
          <el-progress :percentage="pct(o)" :stroke-width="14" status="success" />
          <div class="mt-2 text-4 text-gray-500">
            <span>开始：{{ o.production_started_at || '-' }}</span>
            <br>
            <span>预计：{{ o.expected_finish_at || '-' }}</span>
          </div>
          <div class="mt-2 text-right">
            <el-button size="small" @click="changeStatus(o,'complete')">完成</el-button>
            <el-button size="small" type="primary" @click="changeStatus(o,'ship')">确认入库</el-button>
          </div>
        </el-card>
      </div>
    </el-card>

    <!-- 产能/队列/最新完成 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <el-card shadow="never">
        <template #header>产能概览</template>
        <div class="text-4 text-gray-500 mb-2">日产能：{{ settings.daily_capacity }} 件；工时/日：{{ settings.work_hours_per_day }} 小时</div>
        <el-descriptions :column="1" size="small" border>
          <el-descriptions-item label="当前在制数量">{{ inProgressQty }}</el-descriptions-item>
          <el-descriptions-item label="预计总工时">约 {{ estimatedHours }} 小时（约 {{ estimatedDays }} 天）</el-descriptions-item>
          <el-descriptions-item label="待开工订单">{{ approvedQueue.length }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card shadow="never">
        <template #header>待开工队列</template>
        <el-table :data="approvedQueue" size="small" height="260" empty-text="暂无">
          <el-table-column prop="order_no" label="工厂单" width="140" />
          <el-table-column label="明细件数" width="100" align="right">
            <template #default="{ row }">{{ Array.isArray(row.details) ? row.details.reduce((s:number,d:any)=> s + Number(d.quantity||0), 0) : 0 }}</template>
          </el-table-column>
          <el-table-column label="操作" width="140">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="changeStatus(row,'start')">开工</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>最近完成/入库</template>
        <el-table :data="recentDone" size="small" height="260" empty-text="暂无">
          <el-table-column prop="order_no" label="工厂单" width="140" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }"><el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="finished_at" label="完成时间" width="180" />
        </el-table>
      </el-card>
    </div>

    <!-- 底部：原有明细Top50与款式概览 -->
    <el-card shadow="never">
      <template #header>工厂状态（明细与款式）</template>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4>生产中（明细Top50）</h4>
          <el-table :data="dashboard.in_production" size="small" height="260">
            <el-table-column prop="order_no" label="工厂单" width="140" />
            <el-table-column prop="product_name" label="商品" />
            <el-table-column prop="size" label="尺码" width="80" />
            <el-table-column prop="quantity" label="数量" width="80" align="right" />
          </el-table>
        </div>
        <div>
          <h4>现有款式</h4>
          <el-table :data="dashboard.styles" size="small" height="260">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="sku_count" label="尺码数" width="80" align="right" />
          </el-table>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.text-28{ font-size:28px }
</style>
