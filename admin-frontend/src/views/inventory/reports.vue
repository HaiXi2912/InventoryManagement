<route lang="yaml">
meta:
  title: 统计报表
  icon: ep:data-analysis
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import StatisticsAPI from '@/api/modules/statistics'

// 过滤器与状态
const loading = ref(false)
const dateRange = ref<[string, string]>([
  new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
  new Date().toISOString().split('T')[0]
])
const granularity = ref<'day'|'week'|'month'>('day')
const compareMode = ref<'none'|'yoy'|'mom'>('none')

// 对比数据
const salesTrendCmp = ref<Array<{ key: string; amount: number; count: number }>>([])
const purchaseTrendCmp = ref<Array<{ key: string; amount: number; count: number }>>([])

// KPI
const overview = ref({
  gmv: 0,
  netSales: 0,
  orders: 0,
  items: 0,
  refund: 0,
  grossProfit: 0,
})

// 趋势与图表数据
const salesTrend = ref<Array<{ key: string; amount: number; count: number }>>([])
const purchaseTrend = ref<Array<{ key: string; amount: number; count: number }>>([])
const categoryStats = ref<Array<{ category: string; sales: number; profit: number; percentage: number }>>([])
const topMetric = ref<'amount'|'qty'>('amount')
const topProducts = ref<Array<{ name: string; amount: number; qty: number }>>([])
const sizeSales = ref<Array<{ size: string; qty: number; sales: number }>>([])

// 图表ref
const salesTrendRef = ref<HTMLElement>()
const purchaseTrendRef = ref<HTMLElement>()
const categoryRef = ref<HTMLElement>()
const topRef = ref<HTMLElement>()

let salesTrendChart: echarts.ECharts
let purchaseTrendChart: echarts.ECharts
let categoryChart: echarts.ECharts
let topChart: echarts.ECharts

const dateKeys = (start: string, end: string, g: 'day'|'week'|'month') => {
  const s = new Date(start); const e = new Date(end)
  s.setHours(0,0,0,0); e.setHours(0,0,0,0)
  const keys: string[] = []
  const pad = (n:number)=>String(n).padStart(2,'0')
  if (g==='day') {
    for (let d = new Date(s); d <= e; d.setDate(d.getDate()+1)) {
      keys.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`)
    }
  } else if (g==='week') {
    // 简化：按周一起算，key=YYYY-Wxx
    const d = new Date(s)
    const day = d.getDay() || 7
    d.setDate(d.getDate() - day + 1)
    while (d <= e) {
      const firstJan = new Date(d.getFullYear(),0,1)
      const w = Math.ceil((((d.getTime()-firstJan.getTime())/86400000)+firstJan.getDay()+1)/7)
      keys.push(`${d.getFullYear()}-W${pad(w)}`)
      d.setDate(d.getDate()+7)
    }
  } else {
    const d = new Date(s)
    d.setDate(1)
    while (d <= e) {
      keys.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}`)
      d.setMonth(d.getMonth()+1)
    }
  }
  return keys
}

function shiftDate(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate()+days); return d }
function formatYMD(d: Date) { const pad=(n:number)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

const loadCompare = async (start: string, end: string) => {
  salesTrendCmp.value = []
  purchaseTrendCmp.value = []
  if (compareMode.value === 'none') return
  const s = new Date(start); const e = new Date(end); s.setHours(0,0,0,0); e.setHours(0,0,0,0)
  let s2: Date, e2: Date
  if (compareMode.value === 'yoy') {
    s2 = new Date(s); e2 = new Date(e); s2.setFullYear(s2.getFullYear()-1); e2.setFullYear(e2.getFullYear()-1)
  } else { // mom
    const len = Math.round((e.getTime()-s.getTime())/86400000) + 1
    e2 = shiftDate(s, -1)
    s2 = shiftDate(e2, -(len-1))
  }
  const start2 = formatYMD(s2), end2 = formatYMD(e2)
  const [salesCmpRes, purchCmpRes] = await Promise.all([
    StatisticsAPI.getSalesTrend({ start_date: start2, end_date: end2 }),
    StatisticsAPI.getPurchaseTrend({ start_date: start2, end_date: end2 }) as any,
  ])
  const mapByKey = (rows: Array<{ date:string; amount:any; count:any }>, g: typeof granularity.value) => {
    const map = new Map<string, { amount:number; count:number }>()
    rows.forEach(r => {
      const d = new Date(r.date); const pad=(n:number)=>String(n).padStart(2,'0')
      let key = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
      if (g==='month') key = `${d.getFullYear()}-${pad(d.getMonth()+1)}`
      if (g==='week') {
        const tmp = new Date(d); const day = tmp.getDay()||7; tmp.setDate(tmp.getDate()-day+1)
        const firstJan = new Date(tmp.getFullYear(),0,1)
        const w = Math.ceil((((tmp.getTime()-firstJan.getTime())/86400000)+firstJan.getDay()+1)/7)
        key = `${tmp.getFullYear()}-W${pad(w)}`
      }
      const prev = map.get(key) || { amount:0, count:0 }
      map.set(key, { amount: prev.amount + Number(r.amount||0), count: prev.count + Number(r.count||0) })
    })
    return map
  }
  const keysCurrent = salesTrend.value.map(i=>i.key)
  const cmpSalesMap = mapByKey((salesCmpRes.data||[]) as any, granularity.value)
  const cmpPurchMap = mapByKey((purchCmpRes.data||[]) as any, granularity.value)
  // 以当前keys顺序对齐比较数据（按索引或同名key，优先同名，若无则回退索引对齐）
  const cmpSalesArr: Array<{ key:string; amount:number; count:number }> = []
  const cmpPurchArr: Array<{ key:string; amount:number; count:number }> = []
  keysCurrent.forEach((k, idx) => {
    const sVal = cmpSalesMap.get(k)
    const pVal = cmpPurchMap.get(k)
    // 索引回退：若无同名key，则使用比较区间按序的第 idx 项（先构建一次数组）
  })
  const cmpSalesList = Array.from(cmpSalesMap.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([key,val])=>({ key, amount: val.amount, count: val.count }))
  const cmpPurchList = Array.from(cmpPurchMap.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([key,val])=>({ key, amount: val.amount, count: val.count }))
  keysCurrent.forEach((k, idx) => {
    const sVal = cmpSalesMap.get(k) || cmpSalesList[idx] || { key: k, amount: 0, count: 0 }
    const pVal = cmpPurchMap.get(k) || cmpPurchList[idx] || { key: k, amount: 0, count: 0 }
    cmpSalesArr.push({ key: k, amount: sVal.amount || 0, count: sVal.count || 0 })
    cmpPurchArr.push({ key: k, amount: pVal.amount || 0, count: pVal.count || 0 })
  })
  salesTrendCmp.value = cmpSalesArr
  purchaseTrendCmp.value = cmpPurchArr
}

const loadAll = async () => {
  loading.value = true
  try {
    const [start, end] = dateRange.value

    const results = await Promise.allSettled([
      StatisticsAPI.getOverview({ start_date: start, end_date: end }),
      StatisticsAPI.getSalesTrend({ start_date: start, end_date: end }),
      StatisticsAPI.getPurchaseTrend({ start_date: start, end_date: end }) as any,
      StatisticsAPI.getSalesByCategory({ start_date: start, end_date: end }),
      StatisticsAPI.getTop({ start_date: start, end_date: end, limit: 10 }) as any,
      StatisticsAPI.getSalesBySize({ start_date: start, end_date: end }),
    ])

    const pick = (idx:number, def:any) => {
      const r = results[idx]
      return r && r.status === 'fulfilled' ? (r as any).value : def
    }

    const overviewRes = pick(0, { data: { sale_stats: [], purchase_stats: [] }})
    const salesRes = pick(1, { data: [] })
    const purchaseRes = pick(2, { data: [] })
    const categoryRes = pick(3, { data: [] })
    const topRes = pick(4, { data: [] })
    const sizeRes = pick(5, { data: [] })

    // KPI
    const saleStats = overviewRes.data?.sale_stats || []
    const purchaseStats = overviewRes.data?.purchase_stats || []
    const gmv = saleStats.reduce((s:any, r:any)=> s + Number(r.total_amount||0), 0)
    const orders = saleStats.reduce((s:any, r:any)=> s + Number(r.count||0), 0)
    const cost = purchaseStats.reduce((s:any, r:any)=> s + Number(r.total_amount||0), 0)
    overview.value = { gmv, netSales: gmv, orders, items: 0, refund: 0, grossProfit: gmv - cost }

    // 趋势聚合
    const groupTo = (rows: Array<{ date:string; amount:any; count:any }>, g: typeof granularity.value) => {
      const map = new Map<string, { amount:number; count:number }>()
      rows.forEach(r => {
        const d = new Date(r.date)
        const pad = (n:number)=>String(n).padStart(2,'0')
        let key = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
        if (g==='month') key = `${d.getFullYear()}-${pad(d.getMonth()+1)}`
        if (g==='week') {
          const tmp = new Date(d); const day = tmp.getDay()||7; tmp.setDate(tmp.getDate()-day+1)
          const firstJan = new Date(tmp.getFullYear(),0,1)
          const w = Math.ceil((((tmp.getTime()-firstJan.getTime())/86400000)+firstJan.getDay()+1)/7)
          key = `${tmp.getFullYear()}-W${pad(w)}`
        }
        const prev = map.get(key) || { amount:0, count:0 }
        map.set(key, { amount: prev.amount + Number(r.amount||0), count: prev.count + Number(r.count||0) })
      })
      return map
    }

    const keys = dateKeys(start, end, granularity.value)
    const salesMap = groupTo((salesRes.data || []) as any, granularity.value)
    const purchaseMap = groupTo((purchaseRes.data || []) as any, granularity.value)
    salesTrend.value = keys.map(k => ({ key: k, amount: Number(salesMap.get(k)?.amount||0), count: Number(salesMap.get(k)?.count||0) }))
    purchaseTrend.value = keys.map(k => ({ key: k, amount: Number(purchaseMap.get(k)?.amount||0), count: Number(purchaseMap.get(k)?.count||0) }))

    // 分类与Top、尺码
    categoryStats.value = (categoryRes.data || []).map((r:any)=>({ category: r.category, sales: Number(r.sales||0), profit: Number(r.profit||0), percentage: Number(r.percentage||0) }))
    topProducts.value = (topRes.data || []).map((r:any)=>({ name: r.productName, amount: Number(r.sales||0), qty: Number(r.quantity||0) }))
    sizeSales.value = (sizeRes.data || []).map((r:any)=>({ size: r.size, qty: Number(r.qty||0), sales: Number(r.sales||0) }))

    await loadCompare(start, end)

    await nextTick()
    renderCharts()
  } catch (e:any) {
    ElMessage.error(e?.message || '加载统计失败')
    await nextTick()
    renderCharts()
  } finally {
    loading.value = false
  }
}

const initCharts = () => {
  if (salesTrendRef.value) salesTrendChart = echarts.init(salesTrendRef.value)
  if (purchaseTrendRef.value) purchaseTrendChart = echarts.init(purchaseTrendRef.value)
  if (categoryRef.value) categoryChart = echarts.init(categoryRef.value)
  if (topRef.value) topChart = echarts.init(topRef.value)
}

const renderCharts = () => {
  // 销售趋势
  salesTrendChart?.setOption({
    title: { text: '销售趋势', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { top: 30, data: ['销售额','订单数', compareMode.value==='yoy'?'销售额-同比': (compareMode.value==='mom'?'销售额-环比': null)].filter(Boolean) },
    dataZoom: [{ type:'inside' }, { type:'slider' }],
    xAxis: { type:'category', data: salesTrend.value.map(i=>i.key) },
    yAxis: [ { type:'value', name:'金额(元)' }, { type:'value', name:'订单数' } ],
    series: [
      { name:'销售额', type:'line', smooth:true, data: salesTrend.value.map(i=>i.amount) },
      { name:'订单数', type:'bar', yAxisIndex:1, data: salesTrend.value.map(i=>i.count) },
      ...(compareMode.value==='none' ? [] : [{ name: compareMode.value==='yoy'?'销售额-同比':'销售额-环比', type:'line', smooth:true, lineStyle:{ type:'dashed' }, data: salesTrendCmp.value.map(i=>i.amount) }])
    ]
  })

  // 采购趋势
  purchaseTrendChart?.setOption({
    title: { text: '采购趋势', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { top: 30, data: ['采购额','单据数', compareMode.value==='yoy'?'采购额-同比': (compareMode.value==='mom'?'采购额-环比': null)].filter(Boolean) },
    dataZoom: [{ type:'inside' }, { type:'slider' }],
    xAxis: { type:'category', data: purchaseTrend.value.map(i=>i.key) },
    yAxis: [ { type:'value', name:'金额(元)' }, { type:'value', name:'单据数' } ],
    series: [
      { name:'采购额', type:'line', smooth:true, data: purchaseTrend.value.map(i=>i.amount) },
      { name:'单据数', type:'bar', yAxisIndex:1, data: purchaseTrend.value.map(i=>i.count) },
      ...(compareMode.value==='none' ? [] : [{ name: compareMode.value==='yoy'?'采购额-同比':'采购额-环比', type:'line', smooth:true, lineStyle:{ type:'dashed' }, data: purchaseTrendCmp.value.map(i=>i.amount) }])
    ]
  })

  // 分类（保留为环形图，Treemap待后端分类树接口后替换）
  categoryChart?.setOption({
    title: { text: '分类销售占比', left: 'center' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient:'vertical', left: 'left', top: 'middle' },
    series: [{
      name: '销售额', type:'pie', radius:['40%','70%'], center:['60%','50%'],
      data: categoryStats.value.map(i=>({ name:i.category, value:i.sales }))
    }]
  })

  // Top 榜（支持金额/数量切换）
  const topData = topMetric.value==='amount' ? topProducts.value.map(i=>i.amount) : topProducts.value.map(i=>i.qty)
  const topLabel = topMetric.value==='amount' ? '销售额' : '销量'
  topChart?.setOption({
    title: { text: `热销TOP（${topLabel}）`, left:'center' },
    tooltip: { trigger:'axis', axisPointer:{ type:'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type:'value' },
    yAxis: { type:'category', data: topProducts.value.map(i=>i.name) },
    series: [{ name: topLabel, type:'bar', data: topData }]
  })
}

const exportType = ref<'overview'|'trend'|'category'|'top'|'size'>('category')

const onExport = async () => {
  try {
    const [start, end] = dateRange.value
    const { data } = await StatisticsAPI.exportReports({ start_date: start, end_date: end, type: exportType.value, format: 'csv' })
    const blob = new Blob([data as any], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `数据报表_${exportType.value}_${start}_to_${end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e:any) {
    ElMessage.error(e?.message || '导出失败')
  }
}

watch([granularity, dateRange], () => { loadAll() })
watch(compareMode, () => { loadAll() })

onMounted(() => {
  // 先初始化图表，避免首轮接口失败导致空白
  initCharts()
  loadAll()
  window.addEventListener('resize', ()=>{ salesTrendChart?.resize(); purchaseTrendChart?.resize(); categoryChart?.resize(); topChart?.resize() })
})
</script>

<template>
  <div class="statistics-reports" v-loading="loading">
    <!-- 工具栏 -->
    <div class="toolbar-section">
      <el-card>
        <div class="toolbar">
          <div class="toolbar-left">
            <el-form inline>
              <el-form-item label="时间范围:">
                <el-date-picker
                  v-model="dateRange"
                  type="daterange"
                  range-separator="至"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  format="YYYY-MM-DD"
                  value-format="YYYY-MM-DD"
                />
              </el-form-item>
              <el-form-item label="粒度:">
                <el-radio-group v-model="granularity" size="small">
                  <el-radio-button label="day">日</el-radio-button>
                  <el-radio-button label="week">周</el-radio-button>
                  <el-radio-button label="month">月</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="对比:">
                <el-select v-model="compareMode" placeholder="无" style="width:120px">
                  <el-option label="无" value="none"/>
                  <el-option label="同比" value="yoy"/>
                  <el-option label="环比" value="mom"/>
                </el-select>
              </el-form-item>
              <el-form-item label="导出类型:">
                <el-select v-model="exportType" style="width: 140px">
                  <el-option label="概览" value="overview" />
                  <el-option label="趋势" value="trend" />
                  <el-option label="分类" value="category" />
                  <el-option label="热销TOP" value="top" />
                  <el-option label="尺码" value="size" />
                </el-select>
              </el-form-item>
            </el-form>
          </div>
          <div class="toolbar-right">
            <el-button type="success" @click="onExport">
              <template #icon><i class="ep:download" /></template>导出
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- KPI 区域 -->
    <div class="overview-section">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="overview-content"><div class="overview-info"><div class="overview-value">¥{{ overview.gmv.toLocaleString() }}</div><div class="overview-label">GMV</div></div></div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="overview-content"><div class="overview-info"><div class="overview-value">¥{{ overview.netSales.toLocaleString() }}</div><div class="overview-label">净销售额</div></div></div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="overview-content"><div class="overview-info"><div class="overview-value">{{ overview.orders }}</div><div class="overview-label">订单数</div></div></div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="overview-card">
            <div class="overview-content"><div class="overview-info"><div class="overview-value">¥{{ overview.grossProfit.toLocaleString() }}</div><div class="overview-label">毛利</div></div></div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 趋势图表 -->
    <div class="charts-section">
      <el-row :gutter="20">
        <el-col :span="12"><el-card><div ref="salesTrendRef" class="chart-container"></div></el-card></el-col>
        <el-col :span="12"><el-card><div ref="purchaseTrendRef" class="chart-container"></div></el-card></el-col>
      </el-row>

      <el-row :gutter="20" style="margin-top: 20px">
        <el-col :span="12"><el-card><div ref="categoryRef" class="chart-container"></div></el-card></el-col>
        <el-col :span="12">
          <el-card>
            <template #header>
              <div class="card-header">
                <span>热销TOP</span>
                <div style="float:right; display:flex; gap:8px; align-items:center">
                  <el-radio-group v-model="topMetric" size="small">
                    <el-radio-button label="amount">金额</el-radio-button>
                    <el-radio-button label="qty">数量</el-radio-button>
                  </el-radio-group>
                </div>
              </div>
            </template>
            <div ref="topRef" class="chart-container"></div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 尺码统计 -->
    <div class="size-charts-section">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-card>
            <template #header><div class="card-header"><span>尺码热销榜</span></div></template>
            <el-table :data="sizeSales" size="small" border>
              <el-table-column prop="size" label="尺码" width="120"/>
              <el-table-column prop="qty" label="销量(件)" width="120"/>
              <el-table-column prop="sales" label="销售额(元)">
                <template #default="{ row }">¥{{ row.sales.toFixed(2) }}</template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card>
            <template #header><div class="card-header"><span>说明</span></div></template>
            <div style="color:#909399; font-size:12px">分类树下钻、同比/环比曲线与导出XLSX将在后端导出与分类树API就绪后自动接入。本页已剥离日清月结相关内容，专注销售、采购、分类、趋势、尺码等统计。</div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.statistics-reports { padding: 20px; }
.toolbar-section, .overview-section, .charts-section { margin-bottom: 20px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; }
.overview-card { height: 120px; }
.overview-card .el-card__body { padding: 20px; height: 100%; }
.overview-content { display: flex; align-items: center; height: 100%; }
.overview-info { flex: 1; }
.overview-value { font-size: 24px; font-weight: bold; margin-bottom: 8px; color: #303133; }
.overview-label { font-size: 14px; color: #909399; }
.chart-container { width: 100%; height: 400px; }
.card-header { font-weight: bold; font-size: 16px; }
.size-charts-section { margin-top: 20px; }
.size-charts-section .el-card { padding: 16px; }
.size-charts-section .el-table { width: 100%; }
@media (max-width: 1200px){ .charts-section .el-col{ margin-bottom:20px } .chart-container{ height:350px } }
@media (max-width: 768px){ .statistics-reports{ padding:10px } .overview-card{ height:auto } .overview-value{ font-size:20px } .chart-container{ height:300px } .toolbar{ flex-direction: column; gap: 16px } }
</style>
