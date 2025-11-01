<route lang="yaml">
meta:
  title: 日清月结
  icon: ep:calendar
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import FinanceAPI from '@/api/modules/finance'

// 选择器
const date = ref<string>(new Date().toISOString().split('T')[0])
const period = ref<string>(new Date().toISOString().slice(0,7))

// 视图口径：completed(完成成本) / ordered(下单支出)
const viewMode = ref<'completed'|'ordered'>('completed')

// 数据
const loading = ref(false)
const daily = ref<any>(null)
const monthly = ref<any>(null)

// 计算与格式化
const fmt = (n: any) => Number(n || 0)
const money = (n: any) => fmt(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dailyOrdered = computed(()=> fmt(daily.value?.breakdown?.factory_ordered_cost))
const dailyCompleted = computed(()=> fmt(daily.value?.breakdown?.factory_completed_cost))
const dailyAP = computed(()=> fmt(daily.value?.breakdown?.ap))
const dailyAR = computed(()=> fmt(daily.value?.breakdown?.ar))
const dailyTotalOrdered = computed(()=> fmt(daily.value?.total_ordered_view))
const dailyTotalCompleted = computed(()=> fmt(daily.value?.total_completed_view))
const dailyTotal = computed(()=> viewMode.value==='completed' ? dailyTotalCompleted.value : dailyTotalOrdered.value)

const monthOrdered = computed(()=> fmt(monthly.value?.breakdown?.factory_ordered_cost))
const monthCompleted = computed(()=> fmt(monthly.value?.breakdown?.factory_completed_cost))
const monthAP = computed(()=> fmt(monthly.value?.breakdown?.ap))
const monthAR = computed(()=> fmt(monthly.value?.breakdown?.ar))
const monthTotalOrdered = computed(()=> fmt(monthly.value?.total_ordered_view))
const monthTotalCompleted = computed(()=> fmt(monthly.value?.total_completed_view))
const monthTotal = computed(()=> viewMode.value==='completed' ? monthTotalCompleted.value : monthTotalOrdered.value)

async function load(){
  loading.value = true
  try{
    const [d, m] = await Promise.all([
      FinanceAPI.getDaily(date.value),
      FinanceAPI.getMonthly(period.value),
    ])
    daily.value = d?.data || null
    monthly.value = m?.data || null
  }catch{ ElMessage.error('加载失败') } finally { loading.value=false }
}

async function closeDaily(){ try{ await FinanceAPI.closeDaily(date.value); ElMessage.success('已关账日清'); await load() }catch{ ElMessage.error('关账失败') } }
async function closeMonthly(){ try{ await FinanceAPI.closeMonthly(period.value); ElMessage.success('已关账月结'); await load() }catch{ ElMessage.error('关账失败') } }
async function exportMonthly(){
  try{
    const res:any = await FinanceAPI.exportMonthly(period.value)
    const blob = res as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `statement-${period.value}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }catch{ ElMessage.error('导出失败') }
}

onMounted(load)
watch([date, period], () => { load() })
</script>

<template>
  <div class="p-4 space-y-4" v-loading="loading">
    <el-card>
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="font-600">筛选</div>
          <div class="space-x-2">
            <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" placeholder="选择日清日期" />
            <el-date-picker v-model="period" type="month" value-format="YYYY-MM" placeholder="选择月份" />
            <el-radio-group v-model="viewMode" size="small" class="ml-2">
              <el-radio-button label="completed">完成口径</el-radio-button>
              <el-radio-button label="ordered">下单口径</el-radio-button>
            </el-radio-group>
            <el-button size="small" @click="load">刷新</el-button>
            <el-button size="small" type="primary" @click="closeDaily">关账日清</el-button>
            <el-button size="small" type="primary" @click="closeMonthly">关账本月</el-button>
            <el-button size="small" @click="exportMonthly">导出本月CSV</el-button>
          </div>
        </div>
      </template>

      <!-- 顶部 KPI 概览 -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">今日-下单支出</div>
          <div class="kpi-value">¥{{ money(dailyOrdered) }}</div>
        </el-card>
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">今日-完成成本</div>
          <div class="kpi-value">¥{{ money(dailyCompleted) }}</div>
        </el-card>
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">今日-AP(应付)</div>
          <div class="kpi-value">¥{{ money(dailyAP) }}</div>
        </el-card>
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">今日-AR(应收)</div>
          <div class="kpi-value">¥{{ money(dailyAR) }}</div>
        </el-card>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <el-card shadow="hover" class="kpi-card kpi-accent">
          <div class="kpi-label">今日-口径合计（{{ viewMode==='completed' ? '完成' : '下单' }}）</div>
          <div class="kpi-value">¥{{ money(dailyTotal) }}</div>
        </el-card>
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">本月-下单支出</div>
          <div class="kpi-value">¥{{ money(monthOrdered) }}</div>
        </el-card>
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">本月-完成成本</div>
          <div class="kpi-value">¥{{ money(monthCompleted) }}</div>
        </el-card>
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">本月-口径合计（{{ viewMode==='completed' ? '完成' : '下单' }}）</div>
          <div class="kpi-value">¥{{ money(monthTotal) }}</div>
        </el-card>
      </div>

      <!-- 明细快照（保留简洁版 descriptions） -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <el-descriptions :column="1" title="今日（日清）" size="small" border>
          <el-descriptions-item label="下单支出(¥)">{{ money(dailyOrdered) }}</el-descriptions-item>
          <el-descriptions-item label="完成成本(¥)">{{ money(dailyCompleted) }}</el-descriptions-item>
          <el-descriptions-item label="应付AP(¥)">{{ money(dailyAP) }}</el-descriptions-item>
          <el-descriptions-item label="应收AR(¥)">{{ money(dailyAR) }}</el-descriptions-item>
          <el-descriptions-item :label="`口径合计(${viewMode==='completed' ? '完成' : '下单'})`">{{ money(dailyTotal) }}</el-descriptions-item>
        </el-descriptions>
        <el-descriptions :column="1" title="本月（月结)" size="small" border>
          <el-descriptions-item label="下单支出(¥)">{{ money(monthOrdered) }}</el-descriptions-item>
          <el-descriptions-item label="完成成本(¥)">{{ money(monthCompleted) }}</el-descriptions-item>
          <el-descriptions-item label="应付AP(¥)">{{ money(monthAP) }}</el-descriptions-item>
          <el-descriptions-item label="应收AR(¥)">{{ money(monthAR) }}</el-descriptions-item>
          <el-descriptions-item :label="`口径合计(${viewMode==='completed' ? '完成' : '下单'})`">{{ money(monthTotal) }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="hint">注：完成成本用于正式记账；下单支出为预算口径。</div>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-card { text-align: center }
.kpi-label { font-size: 12px; color: #909399 }
.kpi-value { font-size: 22px; font-weight: 700; margin-top: 4px }
.kpi-accent .kpi-value { color: var(--el-color-primary) }
.hint { margin-top: 8px; font-size: 12px; color: #909399 }
</style>
