<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import FinanceAPI from '@/api/modules/finance'

const props = defineProps<{ date?: string; period?: string }>()

const today = new Date()
const defaultDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
const defaultPeriod = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

const loading = ref(false)
const daily = ref<any>(null)
const monthly = ref<any>(null)

async function load(){
  loading.value = true
  try{
    const [d, m] = await Promise.all([
      FinanceAPI.getDaily(props.date || defaultDate),
      FinanceAPI.getMonthly(props.period || defaultPeriod),
    ])
    daily.value = d?.data || null
    monthly.value = m?.data || null
  }catch{ ElMessage.error('加载日清/月结失败') } finally { loading.value=false }
}

async function closeDaily(){ try{ await FinanceAPI.closeDaily(props.date || defaultDate); ElMessage.success('已关账日清'); await load() }catch{ ElMessage.error('关账失败') } }
async function closeMonthly(){ try{ await FinanceAPI.closeMonthly(props.period || defaultPeriod); ElMessage.success('已关账月结'); await load() }catch{ ElMessage.error('关账失败') } }
async function exportMonthly(){
  try{
    const res:any = await FinanceAPI.exportMonthly(props.period || defaultPeriod)
    const blobData = res as Blob
    const blob = blobData instanceof Blob ? blobData : new Blob([res as any], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `statement-${props.period || defaultPeriod}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }catch{ ElMessage.error('导出失败') }
}

onMounted(load)
watch(() => [props.date, props.period], () => { load() })
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="font-600">财务（日清/月结）</div>
        <div class="space-x-2">
          <el-button size="small" @click="load">刷新</el-button>
          <el-button size="small" type="primary" @click="closeDaily">关账日清</el-button>
          <el-button size="small" type="primary" @click="closeMonthly">关账本月</el-button>
          <el-button size="small" @click="exportMonthly">导出本月CSV</el-button>
        </div>
      </div>
    </template>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <el-descriptions :column="1" title="今日（日清）" size="small" border>
        <el-descriptions-item label="下单支出(¥)">{{ Number(daily?.breakdown?.factory_ordered_cost||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="完成成本(¥)">{{ Number(daily?.breakdown?.factory_completed_cost||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="应付AP(¥)">{{ Number(daily?.breakdown?.ap||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="应收AR(¥)">{{ Number(daily?.breakdown?.ar||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="口径合计(下单)">{{ Number((daily?.total_ordered_view)||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="口径合计(完成)">{{ Number((daily?.total_completed_view)||0).toFixed(2) }}</el-descriptions-item>
      </el-descriptions>
      <el-descriptions :column="1" title="本月（月结预览)" size="small" border>
        <el-descriptions-item label="下单支出(¥)">{{ Number(monthly?.breakdown?.factory_ordered_cost||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="完成成本(¥)">{{ Number(monthly?.breakdown?.factory_completed_cost||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="应付AP(¥)">{{ Number(monthly?.breakdown?.ap||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="应收AR(¥)">{{ Number(monthly?.breakdown?.ar||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="口径合计(下单)">{{ Number((monthly?.total_ordered_view)||0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="口径合计(完成)">{{ Number((monthly?.total_completed_view)||0).toFixed(2) }}</el-descriptions-item>
      </el-descriptions>
    </div>
    <div class="text-12 text-gray-500 mt-2">注：表内“完成成本”用于正式记账；“下单支出”为下单当日的预算口径。</div>
  </el-card>
</template>
