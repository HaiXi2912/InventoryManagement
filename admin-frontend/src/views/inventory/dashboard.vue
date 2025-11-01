<route lang="yaml">
meta:
  title: 进销存仪表板
  icon: ant-design:dashboard-twotone
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { onMounted, ref, nextTick } from 'vue'
import * as echarts from 'echarts'
import StatisticsAPI from '@/api/modules/statistics'

// 工具函数
function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function enumerateDays(start: string, end: string): string[] {
  const ds: string[] = []
  const s = new Date(start)
  const e = new Date(end)
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  while (s.getTime() <= e.getTime()) {
    ds.push(formatDate(s))
    s.setDate(s.getDate() + 1)
  }
  return ds
}

// 数据状态（全部来自后端）
const metrics = ref({
  totalSales: 0,
  todaySales: 0,
  totalOrders: 0,
  todayOrders: 0,
  totalProducts: 0,
  lowStockProducts: 0,
  totalInventoryValue: 0,
})
const loading = ref(true)

// 图表数据
const salesTrend = ref<Array<{ date: string; sales: number; orders: number }>>([])
const amountSummary = ref<{ purchase: number; sale: number }>({ purchase: 0, sale: 0 })
const alertSummary = ref<{ low: number; zero: number; over: number }>({ low: 0, zero: 0, over: 0 })

// ECharts实例引用
const salesChartRef = ref<HTMLDivElement>()
const categoryChartRef = ref<HTMLDivElement>()
const stockChartRef = ref<HTMLDivElement>()
let salesChart: echarts.ECharts | undefined
let categoryChart: echarts.ECharts | undefined
let stockChart: echarts.ECharts | undefined

async function loadDashboard() {
  loading.value = true
  try {
    const now = new Date()
    const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1))
    const end = formatDate(now)

    // 1) 概览（区间：当月）
    const overviewRes = await StatisticsAPI.getOverview({ start_date: start, end_date: end })
    const ov = overviewRes.data
    const saleStats: Array<{ status: string; count: any; total_amount: any }> = ov.sale_stats || []
    const purchaseStats: Array<{ status: string; count: any; total_amount: any }> = ov.purchase_stats || []

    const totalSales = saleStats.reduce((s, i) => s + parseFloat(i.total_amount || 0), 0)
    const totalOrders = saleStats.reduce((s, i) => s + parseInt(i.count || 0), 0)
    const purchaseAmount = purchaseStats.reduce((s, i) => s + parseFloat(i.total_amount || 0), 0)

    metrics.value.totalSales = totalSales
    metrics.value.totalOrders = totalOrders
    metrics.value.totalProducts = Number(ov?.basic_info?.total_products || 0)
    metrics.value.lowStockProducts = Number(ov?.basic_info?.low_stock_count || 0)
    metrics.value.totalInventoryValue = Number(ov?.basic_info?.total_inventory_value || 0)
    metrics.value.todaySales = Number(ov?.today_summary?.sale?.amount || 0)
    metrics.value.todayOrders = Number(ov?.today_summary?.sale?.count || 0)

    amountSummary.value = { purchase: purchaseAmount, sale: totalSales }

    // 2) 月度每日趋势
    const monthlyRes = await StatisticsAPI.getMonthly({ year: now.getFullYear(), month: now.getMonth() + 1 })
    const days = enumerateDays(start, end)
    const trendMap = new Map<string, { sales: number; orders: number }>()
    ;(monthlyRes.data?.daily_trend || [])
      .filter((d: any) => d.type === 'sale')
      .forEach((d: any) => {
        const day = String(d.date).slice(0, 10)
        trendMap.set(day, { sales: parseFloat(d.amount || 0), orders: parseInt(d.count || 0) })
      })
    salesTrend.value = days.map(d => trendMap.get(d) || { sales: 0, orders: 0 }).map((v, idx) => ({ date: days[idx], ...v }))

    // 3) 库存预警
    const alertsRes = await StatisticsAPI.getInventoryAlerts()
    alertSummary.value = {
      low: Number(alertsRes.data?.low_stock?.count || 0),
      zero: Number(alertsRes.data?.zero_stock?.count || 0),
      over: Number(alertsRes.data?.over_stock?.count || 0),
    }

    await nextTick()
    initCharts()
    updateCharts()
  }
  finally {
    loading.value = false
  }
}

function initCharts() {
  if (salesChartRef.value && !salesChart) salesChart = echarts.init(salesChartRef.value)
  if (categoryChartRef.value && !categoryChart) categoryChart = echarts.init(categoryChartRef.value)
  if (stockChartRef.value && !stockChart) stockChart = echarts.init(stockChartRef.value)

  window.addEventListener('resize', () => {
    salesChart?.resize()
    categoryChart?.resize()
    stockChart?.resize()
  })
}

function updateCharts() {
  updateSalesChart()
  updateCategoryChart()
  updateStockChart()
}

function updateSalesChart() {
  if (!salesChart) return
  const option: echarts.EChartsOption = {
    title: { text: '销售趋势', left: '2%' },
    tooltip: { trigger: 'axis' },
    legend: { top: '8%', data: ['销售额', '订单数'] },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '20%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: salesTrend.value.map(i => i.date.slice(5)) },
    yAxis: [
      { type: 'value', name: '销售额 (元)', position: 'left' },
      { type: 'value', name: '订单数', position: 'right' },
    ],
    series: [
      { name: '销售额', type: 'line', smooth: true, yAxisIndex: 0, itemStyle: { color: '#409EFF' }, data: salesTrend.value.map(i => i.sales) },
      { name: '订单数', type: 'line', smooth: true, yAxisIndex: 1, itemStyle: { color: '#67C23A' }, data: salesTrend.value.map(i => i.orders) },
    ],
  }
  salesChart.setOption(option)
}

function updateCategoryChart() {
  if (!categoryChart) return
  const option: echarts.EChartsOption = {
    title: { text: '进销金额占比（当月）', left: 'center' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left', top: '15%' },
    series: [
      {
        name: '金额',
        type: 'pie',
        radius: '55%',
        center: ['60%', '50%'],
        data: [
          { value: amountSummary.value.sale, name: '销售额' },
          { value: amountSummary.value.purchase, name: '进货额' },
        ],
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
      },
    ],
  }
  categoryChart.setOption(option)
}

function updateStockChart() {
  if (!stockChart) return
  const option: echarts.EChartsOption = {
    title: { text: '库存预警分布', left: '2%' },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
    xAxis: { type: 'category', data: ['低库存', '零库存', '超库存'] },
    yAxis: { type: 'value', name: '商品数' },
    series: [
      {
        name: '数量',
        type: 'bar',
        data: [alertSummary.value.low, alertSummary.value.zero, alertSummary.value.over],
        itemStyle: {
          color: (params: any) => ['#E6A23C', '#F56C6C', '#409EFF'][params.dataIndex] || '#909399',
        },
      },
    ],
  }
  stockChart.setOption(option)
}

onMounted(() => {
  loadDashboard()
})
</script>

<template>
  <div class="inventory-dashboard">
    <div v-loading="loading" class="dashboard-content">
      <!-- 关键指标卡片 -->
      <div class="metrics-grid">
        <el-card class="metric-card sales">
          <div class="metric-content">
            <div class="metric-icon">
              <FaIcon name="i-ep:money" size="32" />
            </div>
            <div class="metric-info">
              <div class="metric-value">¥{{ metrics.totalSales.toLocaleString() }}</div>
              <div class="metric-label">总销售额</div>
              <div class="metric-sub">今日: ¥{{ metrics.todaySales.toLocaleString() }}</div>
            </div>
          </div>
        </el-card>

        <el-card class="metric-card orders">
          <div class="metric-content">
            <div class="metric-icon">
              <FaIcon name="i-ep:shopping-cart" size="32" />
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ metrics.totalOrders }}</div>
              <div class="metric-label">总订单数</div>
              <div class="metric-sub">今日: {{ metrics.todayOrders }}</div>
            </div>
          </div>
        </el-card>

        <el-card class="metric-card products">
          <div class="metric-content">
            <div class="metric-icon">
              <FaIcon name="i-ep:box" size="32" />
            </div>
            <div class="metric-info">
              <div class="metric-value">{{ metrics.totalProducts }}</div>
              <div class="metric-label">商品总数</div>
              <div class="metric-sub">低库存: {{ metrics.lowStockProducts }}</div>
            </div>
          </div>
        </el-card>

        <el-card class="metric-card customers">
          <div class="metric-content">
            <div class="metric-icon">
              <FaIcon name="i-ep:trend-charts" size="32" />
            </div>
            <div class="metric-info">
              <div class="metric-value">¥{{ metrics.totalInventoryValue.toLocaleString() }}</div>
              <div class="metric-label">库存总价值</div>
              <div class="metric-sub">数据来自库存估值</div>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 图表区域 -->
      <div class="charts-grid">
        <!-- 销售趋势图表 -->
        <el-card class="chart-card">
          <div ref="salesChartRef" class="chart-container" />
        </el-card>

        <!-- 进销金额占比 -->
        <el-card class="chart-card">
          <div ref="categoryChartRef" class="chart-container" />
        </el-card>

        <!-- 库存预警分布 -->
        <el-card class="chart-card full-width">
          <div ref="stockChartRef" class="chart-container" />
        </el-card>
      </div>

      <!-- 快速操作区域（保留样式，无功能改动） -->
      <div class="quick-actions">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>快速操作</span>
            </div>
          </template>
          <div class="action-buttons">
            <el-button type="primary" size="large">
              <FaIcon name="i-ep:plus" /> 添加商品
            </el-button>
            <el-button type="success" size="large">
              <FaIcon name="i-ep:upload" /> 入库管理
            </el-button>
            <el-button type="warning" size="large">
              <FaIcon name="i-ep:download" /> 出库管理
            </el-button>
            <el-button type="info" size="large">
              <FaIcon name="i-ep:document-add" /> 生成报表
            </el-button>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.inventory-dashboard {
  padding: 20px;
  background-color: #f5f7fa;
  min-height: calc(100vh - 120px);
}

.dashboard-content {
  max-width: 1400px;
  margin: 0 auto;
}

// 指标卡片网格
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.metric-card {
  border-radius: 12px;
  border: none;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  &.sales {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  &.orders {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
  }

  &.products {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    color: white;
  }

  &.customers {
    background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
    color: white;
  }
}

.metric-content {
  display: flex;
  align-items: center;
  gap: 15px;
}

.metric-icon {
  opacity: 0.8;
}

.metric-info {
  flex: 1;
}

.metric-value {
  font-size: 28px;
  font-weight: bold;
  line-height: 1;
  margin-bottom: 5px;
}

.metric-label {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 3px;
}

.metric-sub {
  font-size: 12px;
}

// 图表网格
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.chart-card {
  border-radius: 12px;
  border: none;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);

  &.full-width {
    grid-column: 1 / -1;
  }
}

.chart-container {
  height: 350px;
  width: 100%;
}

// 快速操作区域
.quick-actions {
  .card-header {
    font-weight: bold;
    color: #303133;
  }

  .action-buttons {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;

    .el-button {
      flex: 1;
      min-width: 120px;
      height: 40px;
      border-radius: 8px;
      font-weight: 500;
    }
  }
}

// 响应式设计
@media (max-width: 768px) {
  .inventory-dashboard {
    padding: 10px;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .charts-grid {
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .chart-container {
    height: 300px;
  }

  .action-buttons {
    .el-button {
      flex: none;
      width: 100%;
    }
  }
}
</style>