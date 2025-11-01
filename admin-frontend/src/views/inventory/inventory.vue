<route lang="yaml">
meta:
  title: 库存查询
  icon: ep:box
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import inventoryApi from '@/api/modules/inventory'
import productsApi from '@/api/modules/products'
import productExtApi from '@/api/modules/productExt'

// 库存数据接口
interface InventoryItem {
  id: string | number
  productId: string | number
  productName: string
  category: string
  sku: string
  currentStock: number
  minStock: number
  maxStock: number
  unitPrice: number
  totalValue: number
  warehouseName: string
  location: string
  lastUpdateTime: string
  status: 'normal' | 'low' | 'out' | 'excess'
}

// 仓库信息接口
interface Warehouse {
  id: string
  name: string
  address: string
}

// SKU 项
interface SkuItem {
  id: number | string
  size: string
  // 颜色改为可选，仅兼容历史数据
  color?: string
  barcode: string
  sku_code?: string
  stock: number
  locked_stock?: number
  status?: 'active' | 'disabled'
  retail_price?: number
  cost_price?: number
  // 销量指标
  total_sold?: number
  sold_30d?: number
}

// 响应式数据
const loading = ref(false)
const searchForm = ref({
  keyword: '',
  category: '',
  warehouseId: '',
  status: '',
  minStock: '',
  maxStock: ''
})

const inventoryItems = ref<InventoryItem[]>([])
const warehouses = ref<Warehouse[]>([])
const categories = ref<string[]>([
  '女装',
  '男装',
  '童装',
  '内衣家居',
  '运动户外',
  '鞋靴',
  '配饰',
  '工装制服',
  '大码/孕产',
  '居家服/睡衣',
  '其他'
])
const total = ref(0)
const pageSize = ref(20)
const currentPage = ref(1)

// 统计数据
const statistics = ref({
  totalProducts: 0,
  totalValue: 0,
  lowStockCount: 0,
  outOfStockCount: 0
})

// 计算属性
const statusMap = {
  normal: { text: '正常', type: 'success' },
  low: { text: '库存不足', type: 'warning' },
  out: { text: '缺货', type: 'danger' },
  excess: { text: '库存过多', type: 'info' }
} as const satisfies Record<'normal' | 'low' | 'out' | 'excess', { text: string; type: 'primary' | 'success' | 'warning' | 'info' | 'danger' }>

const filteredItems = computed(() => {
  let items = inventoryItems.value
  
  if (searchForm.value.keyword) {
    const keyword = searchForm.value.keyword.toLowerCase()
    items = items.filter(item => 
      (item.productName || '').toLowerCase().includes(keyword) ||
      (item.sku || '').toLowerCase().includes(keyword)
    )
  }
  
  if (searchForm.value.category) {
    items = items.filter(item => item.category === searchForm.value.category)
  }
  
  if (searchForm.value.warehouseId) {
    const whName = warehouses.value.find(w => w.id === searchForm.value.warehouseId)?.name
    items = items.filter(item => item.warehouseName === whName)
  }
  
  if (searchForm.value.status) {
    items = items.filter(item => item.status === searchForm.value.status)
  }
  
  if (searchForm.value.minStock) {
    items = items.filter(item => item.currentStock >= Number(searchForm.value.minStock))
  }
  
  if (searchForm.value.maxStock) {
    items = items.filter(item => item.currentStock <= Number(searchForm.value.maxStock))
  }
  
  return items
})

// 方法
const computeStatus = (current: number, min?: number, max?: number): InventoryItem['status'] => {
  if (!current || current === 0) return 'out'
  if (typeof min === 'number' && current <= min) return 'low'
  if (typeof max === 'number' && max > 0 && current > max) return 'excess'
  return 'normal'
}

const loadInventoryData = async () => {
  loading.value = true
  try {
    const params: any = {
      page: currentPage.value,
      limit: pageSize.value,
    }
    // 若选择了仓库，带上 warehouse_location
    if (searchForm.value.warehouseId) {
      const whName = warehouses.value.find(w => w.id === searchForm.value.warehouseId)?.name
      if (whName) params.warehouse_location = whName
    }
    // 仅当选择“库存不足”时，启用后端低库存筛选
    if (searchForm.value.status === 'low') params.low_stock = true

    const res = await inventoryApi.getInventoryList(params)
    const list = (res.data?.inventory || []) as any[]

    inventoryItems.value = list.map((inv: any) => {
      const product = inv.product || {}
      const current = Number(inv.current_stock || 0)
      const min = Number(product.min_stock ?? 0)
      const max = Number(product.max_stock ?? 0)
      const lastUpdate = inv.updated_at || inv.updatedAt || inv.last_update_time || ''
      return {
        id: inv.id,
        productId: product.id,
        productName: product.name || '-',
        category: product.category || '-',
        sku: product.code || '-',
        currentStock: current,
        minStock: min,
        maxStock: max,
        unitPrice: Number(inv.average_cost || 0),
        totalValue: Number(inv.total_value || current * Number(inv.average_cost || 0)),
        warehouseName: inv.warehouse_location || '-',
        location: inv.warehouse_location || '-',
        lastUpdateTime: lastUpdate ? String(lastUpdate).replace('T', ' ').slice(0, 19) : '-',
        status: computeStatus(current, min, max)
      } as InventoryItem
    })

    total.value = Number(res.data?.pagination?.total_count || inventoryItems.value.length)

    // 异步预取当前页商品的 SKU，便于列表直接显示尺码库存（不阻塞）
    setTimeout(() => { prefetchSkusForVisibleRows() }, 0)

    // 统计数据（用后端统计接口）
    try {
      const statRes = await inventoryApi.getInventoryStats()
      const stats = statRes.data?.statistics || {}
      statistics.value = {
        totalProducts: Number(stats.total_products || 0),
        totalValue: Number(stats.total_value || 0),
        lowStockCount: Number(stats.low_stock_products || 0),
        outOfStockCount: Number(stats.zero_stock_products || 0),
      }
    } catch (e) {
      // 忽略统计错误
    }
  } catch (error) {
    ElMessage.error('加载库存数据失败')
  } finally {
    loading.value = false
  }
}

const loadWarehouses = async () => {
  try {
    const res = await inventoryApi.getWarehouses()
    const list: string[] = res.data?.warehouses || []
    warehouses.value = list.map(name => ({ id: name, name, address: '' }))
  } catch (error) {
    ElMessage.error('加载仓库列表失败')
  }
}

const loadCategories = async () => {
  try {
    const res = await productsApi.getCategories()
    categories.value = res.data?.categories || []
  } catch (error) {
    ElMessage.error('加载分类列表失败')
  }
}

// 加载 SKU 列表并合并销量指标
const skuMap = ref<Record<string | number, { loading: boolean; list: SkuItem[] }>>({})

// 原因码
const reasons = ref<{ code: string; name: string }[]>([])

// 方法
const loadSkus = async (productId: string | number) => {
  if (!productId) return
  if (!skuMap.value[productId]) skuMap.value[productId] = { loading: false, list: [] }
  skuMap.value[productId].loading = true
  try {
    const res = await productExtApi.listSkus(productId)
    const list = (res as any).data || []
    const skus: SkuItem[] = list.map((s: any) => ({
      id: s.id,
      size: s.size,
      color: s.color || '',
      barcode: s.barcode,
      sku_code: s.sku_code,
      stock: Number(s.stock || 0),
      locked_stock: Number(s.locked_stock || 0),
      status: s.status,
      // 忽略 SKU 价：统一价不展示独立零售价
      retail_price: undefined as any,
      cost_price: Number(s.cost_price || 0),
    }))
    skuMap.value[productId].list = skus
    if (skus.length) {
      const metrics = await inventoryApi.getSkuMetrics(skus.map(s=>s.id))
      const m = (metrics as any)?.data || []
      const mMap: Record<string, any> = {}
      m.forEach((x:any)=>{ mMap[String(x.id)] = x })
      skuMap.value[productId].list = skus.map(s => ({ ...s, total_sold: mMap[String(s.id)]?.total_sold || 0, sold_30d: mMap[String(s.id)]?.sold_30d || 0 }))
    }
  } catch (e) {
    ElMessage.error('加载SKU失败')
  } finally {
    skuMap.value[productId].loading = false
  }
}

// 按需加载当前商品的 SKU（用于主表尺码库存列悬停/首次渲染）
const ensureSkusLoaded = (productId: string | number) => {
  if (!productId) return
  const entry = skuMap.value[productId]
  if (!entry || (!entry.loading && (!entry.list || entry.list.length === 0))) {
    loadSkus(productId)
  }
}

// 主表展开事件
const onExpandChange = async (row: any) => {
  if (!row?.productId) return
  await loadSkus(row.productId)
}

const handleSearch = () => {
  currentPage.value = 1
  loadInventoryData()
}

const handleReset = () => {
  searchForm.value = {
    keyword: '',
    category: '',
    warehouseId: '',
    status: '',
    minStock: '',
    maxStock: ''
  }
  currentPage.value = 1
  loadInventoryData()
}

const exportAllLogs = () => {
  const url = '/api/stock/logs/export.csv'
  window.open(url, '_blank')
}
const exportSkuLogs = (skuId: number | string) => {
  const url = `/api/stock/logs/export.csv?sku_id=${encodeURIComponent(String(skuId))}`
  window.open(url, '_blank')
}

const refreshData = () => {
  loadInventoryData()
}

// ----------------- SKU 调整对话框 -----------------
const skuAdjustDialogVisible = ref(false)
const skuAdjustLoading = ref(false)
const skuAdjustForm = ref<{
  sku_id: number | string
  productName: string
  size: string
  change_qty: number
  reason?: string
  remark?: string
}>({
  sku_id: '',
  productName: '',
  size: '',
  change_qty: 1,
  reason: undefined,
  remark: ''
})

const handleSkuAdjust = (prod: any, sku: SkuItem) => {
  skuAdjustForm.value = {
    sku_id: sku.id,
    productName: prod.productName,
    size: sku.size,
    change_qty: 1,
    reason: reasons.value[0]?.code,
    remark: ''
  }
  skuAdjustDialogVisible.value = true
}

const submitSkuAdjust = async () => {
  const f = skuAdjustForm.value
  if (!f.sku_id || !Number.isFinite(Number(f.change_qty))) {
    ElMessage.warning('请输入有效的数量')
    return
  }
  try {
    skuAdjustLoading.value = true
    await inventoryApi.adjustSkus([{ sku_id: f.sku_id, change_qty: Number(f.change_qty), reason: f.reason, remark: f.remark }])
    ElMessage.success('SKU库存已调整')
    skuAdjustDialogVisible.value = false
    // 刷新当前 SKU 列表
    const pid = Object.keys(skuMap.value).find(pid => skuMap.value[pid].list.some(s => String(s.id) === String(f.sku_id)))
    if (pid) await loadSkus(pid)
    // 刷新主表
    loadInventoryData()
  } catch (e: any) {
    ElMessage.error(e?.message || '库存调整失败')
  } finally {
    skuAdjustLoading.value = false
  }
}

// ----------------- SKU 盘点对话框 -----------------
const skuStockDialogVisible = ref(false)
const skuStockLoading = ref(false)
const skuStockForm = ref<{
  sku_id: number | string
  productName: string
  size: string
  actual_qty: number
  remark?: string
}>({
  sku_id: '',
  productName: '',
  size: '',
  actual_qty: 0,
  remark: ''
})

const handleSkuStocktake = (prod: any, sku: SkuItem) => {
  skuStockForm.value = {
    sku_id: sku.id,
    productName: prod.productName,
    size: sku.size,
    actual_qty: sku.stock,
    remark: ''
  }
  skuStockDialogVisible.value = true
}

const submitSkuStocktake = async () => {
  const f = skuStockForm.value
  if (!f.sku_id || !Number.isFinite(Number(f.actual_qty))) {
    ElMessage.warning('请输入有效的实盘数量')
    return
  }
  try {
    skuStockLoading.value = true
    await inventoryApi.stocktakeSku(f.sku_id, Number(f.actual_qty), f.remark)
    ElMessage.success('盘点完成')
    skuStockDialogVisible.value = false
    const pid = Object.keys(skuMap.value).find(pid => skuMap.value[pid].list.some(s => String(s.id) === String(f.sku_id)))
    if (pid) await loadSkus(pid)
    loadInventoryData()
  } catch (e: any) {
    ElMessage.error(e?.message || '盘点失败')
  } finally {
    skuStockLoading.value = false
  }
}

// 行样式（低库存/缺货弱底色）
const rowClassName = ({ row }: { row: any }) => {
  if (!row) return ''
  if (row.status === 'low') return 'row-warning'
  if (row.status === 'out') return 'row-danger'
  return ''
}

// 快速筛选状态
const quickSetStatus = (s: '' | 'normal' | 'low' | 'out' | 'excess') => {
  // @ts-ignore 允许清空
  searchForm.value.status = s
  handleSearch()
}

// 并发控制的预取器：加载当前页可见商品的 SKU，用于直接在列表显示尺码库存
const prefetchSkusForVisibleRows = async () => {
  const ids = (inventoryItems.value || []).map(i => i.productId).filter(Boolean)
  if (!ids.length) return
  const concurrency = 4
  let idx = 0
  const runNext = async (): Promise<void> => {
    if (idx >= ids.length) return
    const id = ids[idx++]
    try { await loadSkus(id as any) } catch {}
    return runNext()
  }
  const workers = Array(Math.min(concurrency, ids.length)).fill(0).map(() => runNext())
  await Promise.allSettled(workers)
}

// 生命周期
onMounted(() => {
  loadWarehouses()
  loadCategories()
  loadInventoryData()
  // 加载原因码
  inventoryApi.getReasons().then((r: any) => { reasons.value = r?.data || [] }).catch(() => {})
})
</script>

<template>
  <div class="inventory-query">
    <!-- 统计卡片 -->
    <div class="statistics-section">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-value">{{ statistics.totalProducts }}</div>
              <div class="stat-label">商品总数</div>
            </div>
            <div class="stat-icon total">
              <i class="ep:goods" />
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-value">¥{{ statistics.totalValue.toLocaleString() }}</div>
              <div class="stat-label">库存总值</div>
            </div>
            <div class="stat-icon value">
              <i class="ep:money" />
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-value warning">{{ statistics.lowStockCount }}</div>
              <div class="stat-label">库存不足</div>
            </div>
            <div class="stat-icon warning">
              <i class="ep:warning" />
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-value danger">{{ statistics.outOfStockCount }}</div>
              <div class="stat-label">缺货商品</div>
            </div>
            <div class="stat-icon danger">
              <i class="ep:close" />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 搜索区域（下方加快速筛选） -->
    <div class="search-section">
      <el-card class="compact-card" shadow="never">
        <el-form :model="searchForm" inline class="compact-form" size="small">
          <el-form-item label="关键词">
            <el-input
              v-model="searchForm.keyword"
              placeholder="商品名称/SKU"
              clearable
              style="width: 200px"
            />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="searchForm.category" placeholder="请选择" clearable style="width: 120px">
              <el-option
                v-for="category in categories"
                :key="category"
                :label="category"
                :value="category"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="仓库">
            <el-select v-model="searchForm.warehouseId" placeholder="请选择" clearable style="width: 120px">
              <el-option
                v-for="warehouse in warehouses"
                :key="warehouse.id"
                :label="warehouse.name"
                :value="warehouse.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="searchForm.status" placeholder="请选择" clearable style="width: 120px">
              <el-option label="正常" value="normal" />
              <el-option label="库存不足" value="low" />
              <el-option label="缺货" value="out" />
              <el-option label="库存过多" value="excess" />
            </el-select>
          </el-form-item>
          <el-form-item label="库存范围">
            <el-input
              v-model="searchForm.minStock"
              placeholder="最小库存"
              type="number"
              style="width: 100px"
            />
            <span style="margin: 0 8px">至</span>
            <el-input
              v-model="searchForm.maxStock"
              placeholder="最大库存"
              type="number"
              style="width: 100px"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="small" @click="handleSearch">
              <template #icon>
                <i class="ep:search" />
              </template>
              搜索
            </el-button>
            <el-button size="small" @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
        <div class="quick-filters">
          <span class="qf-label">快速筛选:</span>
          <el-check-tag :checked="!searchForm.status" @change="() => quickSetStatus('')">全部</el-check-tag>
          <el-check-tag :checked="searchForm.status==='normal'" @change="() => quickSetStatus('normal')">正常</el-check-tag>
          <el-check-tag type="warning" :checked="searchForm.status==='low'" @change="() => quickSetStatus('low')">低库存</el-check-tag>
          <el-check-tag type="danger" :checked="searchForm.status==='out'" @change="() => quickSetStatus('out')">缺货</el-check-tag>
          <el-check-tag type="info" :checked="searchForm.status==='excess'" @change="() => quickSetStatus('excess')">库存过多</el-check-tag>
        </div>
      </el-card>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar-section">
      <el-card class="compact-card" shadow="never">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-button type="primary" size="small" @click="refreshData">
              <template #icon>
                <i class="ep:refresh" />
              </template>
              刷新数据
            </el-button>
          </div>
          <div class="toolbar-right">
            <el-button type="success" size="small" @click="exportAllLogs">
              <template #icon>
                <i class="ep:download" />
              </template>
              导出库存流水CSV
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 表格区域 -->
    <div class="table-section">
      <el-card class="compact-card" shadow="never">
        <el-table
          :data="filteredItems"
          v-loading="loading"
          stripe
          border
          size="small"
          class="dense-table"
          style="width: 100%"
          :row-class-name="rowClassName"
          :default-sort="{ prop: 'lastUpdateTime', order: 'descending' }"
          @expand-change="onExpandChange"
        >
          <!-- 展开列：SKU 明细 -->
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="sku-expand">
                <el-skeleton v-if="!skuMap[row.productId] || skuMap[row.productId].loading" :rows="3" animated />
                <template v-else>
                  <template v-if="(skuMap[row.productId].list||[]).length">
                    <el-table :data="skuMap[row.productId].list" size="small" border class="dense-table">
                      <el-table-column prop="size" label="尺码" width="90">
                        <template #default="{ row: s }">
                          <span class="size-pill" :class="{ danger: s.stock===0, warn: s.stock>0 && s.stock<=3 }">{{ s.size }}</span>
                        </template>
                      </el-table-column>
                      <el-table-column prop="barcode" label="条码" min-width="140">
                        <template #default="{ row: s }">
                          <el-tooltip :content="s.barcode" placement="top">
                            <span class="text-ellipsis">{{ s.barcode }}</span>
                          </el-tooltip>
                        </template>
                      </el-table-column>
                      <el-table-column prop="sku_code" label="SKU编码" min-width="120" :class-name="'hide-sm'">
                        <template #default="{ row: s }">
                          <el-tooltip :content="s.sku_code" placement="top">
                            <span class="text-ellipsis">{{ s.sku_code }}</span>
                          </el-tooltip>
                        </template>
                      </el-table-column>
                      <el-table-column prop="stock" label="库存" width="90" align="right">
                        <template #default="{ row: s }">
                          <span :class="{ 'text-danger': s.stock === 0, 'text-warning': s.stock > 0 && s.stock <= 3 }">{{ s.stock }}</span>
                        </template>
                      </el-table-column>
                      <el-table-column prop="locked_stock" label="占用" width="80" align="right" />
                      <el-table-column label="销量(总/30天)" width="140" align="right">
                        <template #default="{ row: s }">
                          {{ (s.total_sold||0) }}/{{ (s.sold_30d||0) }}
                        </template>
                      </el-table-column>
                      <el-table-column prop="status" label="状态" width="90" align="center">
                        <template #default="{ row: s }">
                          <el-tag size="small" :type="s.stock === 0 ? 'danger' : (s.stock <= 3 ? 'warning' : 'success')">
                            {{ s.stock === 0 ? '缺货' : (s.stock <= 3 ? '低库存' : '正常') }}
                          </el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="操作" width="220" fixed="right">
                        <template #default="{ row: s }">
                          <el-button type="primary" size="small" @click="handleSkuAdjust(row, s)">调整</el-button>
                          <el-button type="warning" size="small" @click="handleSkuStocktake(row, s)">盘点</el-button>
                          <el-button size="small" @click="exportSkuLogs(s.id)">流水</el-button>
                        </template>
                      </el-table-column>
                    </el-table>
                  </template>
                  <el-empty v-else description="暂无尺码数据" />
                </template>
              </div>
            </template>
          </el-table-column>

          <!-- 原有商品聚合列 -->
          <el-table-column prop="productName" label="商品名称" width="150" />
          <el-table-column prop="sku" label="SKU" width="120" />
          <el-table-column prop="category" label="分类" width="100" />

          <!-- 新增：直接在列表展示尺码库存（横向紧凑） -->
          <el-table-column label="尺码库存" min-width="260">
            <template #default="{ row }">
              <div class="size-inline" @mouseenter="ensureSkusLoaded(row.productId)">
                <template v-if="skuMap[row.productId] && (skuMap[row.productId].list || []).length">
                  <span
                    v-for="s in skuMap[row.productId].list"
                    :key="s.id"
                    class="size-chip"
                    :class="{ danger: s.stock === 0, warn: s.stock > 0 && s.stock <= 3 }"
                    :title="`${s.size} 库存：${s.stock}`"
                  >
                    {{ s.size }}: {{ s.stock }}
                  </span>
                </template>
                <el-skeleton v-else-if="skuMap[row.productId]?.loading" :rows="1" animated style="width: 160px" />
                <span v-else class="text-muted">—</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="currentStock" label="当前库存" width="100" align="right">
            <template #default="{ row }">
              <span :class="{ 'text-danger': row.status === 'out', 'text-warning': row.status === 'low' }">
                {{ row.currentStock }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="minStock" label="最小库存" width="100" align="right" />
          <el-table-column prop="maxStock" label="最大库存" width="100" align="right" />
          <el-table-column prop="unitPrice" label="单价" width="100" align="right">
            <template #default="{ row }">
              ¥{{ row.unitPrice.toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column prop="totalValue" label="库存价值" width="120" align="right">
            <template #default="{ row }">
              <span class="amount">¥{{ row.totalValue.toLocaleString() }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="warehouseName" label="仓库" width="100" />
          <el-table-column prop="location" label="库位" width="100" :class-name="'hide-sm'" />
          <el-table-column prop="status" label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="statusMap[(row.status as keyof typeof statusMap)]?.type || 'info'" size="small">
                {{ statusMap[(row.status as keyof typeof statusMap)]?.text || '未知' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="lastUpdateTime" label="更新时间" width="150" sortable />
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openSizeDrawer(row)">尺码库存</el-button>
              <el-button type="primary" size="small" @click="handleStockAdjust(row)">
                库存调整
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination-section">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[20, 50, 100, 200]"
            background
            small
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="loadInventoryData"
            @current-change="loadInventoryData"
          />
        </div>
      </el-card>
    </div>

    <!-- SKU 调整对话框（商品聚合） -->
    <el-dialog
      v-model="adjustDialogVisible"
      title="库存调整"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="商品">
          <el-input :model-value="adjustForm.productName" disabled />
        </el-form-item>
        <el-form-item label="仓库">
          <el-input v-model="adjustForm.warehouse_location" placeholder="仓库" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="adjustForm.adjustment_type">
            <el-radio-button label="in">入库</el-radio-button>
            <el-radio-button label="out">出库</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="数量">
          <el-input v-model.number="adjustForm.quantity" type="number" min="1" placeholder="数量" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="adjustForm.reason" placeholder="原因（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjustLoading" @click="submitAdjust">确定</el-button>
      </template>
    </el-dialog>

    <!-- SKU 库存调整对话框（去颜色） -->
    <el-dialog v-model="skuAdjustDialogVisible" title="SKU 库存调整" width="520px" :close-on-click-modal="false">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="商品">
          <el-input :model-value="skuAdjustForm.productName" disabled />
        </el-form-item>
        <el-form-item label="尺码">
          <el-input :model-value="skuAdjustForm.size" disabled />
        </el-form-item>
        <el-form-item label="数量">
          <el-input v-model.number="skuAdjustForm.change_qty" type="number" placeholder="正数入库，负数出库" />
        </el-form-item>
        <el-form-item label="原因">
          <el-select v-model="skuAdjustForm.reason" placeholder="选择原因" style="width: 200px" clearable>
            <el-option v-for="r in reasons" :key="r.code" :label="r.name" :value="r.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="skuAdjustForm.remark" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skuAdjustDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="skuAdjustLoading" @click="submitSkuAdjust">确定</el-button>
      </template>
    </el-dialog>

    <!-- SKU 盘点对话框（去颜色） -->
    <el-dialog v-model="skuStockDialogVisible" title="SKU 盘点" width="520px" :close-on-click-modal="false">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="商品">
          <el-input :model-value="skuStockForm.productName" disabled />
        </el-form-item>
        <el-form-item label="尺码">
          <el-input :model-value="skuStockForm.size" disabled />
        </el-form-item>
        <el-form-item label="实盘数">
          <el-input v-model.number="skuStockForm.actual_qty" type="number" min="0" placeholder="请输入实盘数量" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="skuStockForm.remark" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skuStockDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="skuStockLoading" @click="submitSkuStocktake">确定</el-button>
      </template>
    </el-dialog>

    <!-- 尺码库存抽屉 -->
    <el-drawer v-model="sizeDrawerVisible" :title="sizeDrawerTitle" size="45%" :with-header="true">
      <div class="size-drawer-body">
        <el-skeleton v-if="sizeDrawerLoading" :rows="4" animated />
        <template v-else>
          <template v-if="sizeList.length">
            <el-table :data="sizeList" size="small" border class="dense-table">
              <el-table-column prop="size" label="尺码" width="90">
                <template #default="{ row: s }">
                  <span class="size-pill" :class="{ danger: s.stock===0, warn: s.stock>0 && s.stock<=3 }">{{ s.size }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="barcode" label="条码" min-width="140">
                <template #default="{ row: s }">
                  <el-tooltip :content="s.barcode" placement="top">
                    <span class="text-ellipsis">{{ s.barcode }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column prop="sku_code" label="SKU编码" min-width="120" :class-name="'hide-sm'">
                <template #default="{ row: s }">
                  <el-tooltip :content="s.sku_code" placement="top">
                    <span class="text-ellipsis">{{ s.sku_code }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column prop="stock" label="库存" width="90" align="right">
                <template #default="{ row: s }">
                  <span :class="{ 'text-danger': s.stock === 0, 'text-warning': s.stock > 0 && s.stock <= 3 }">{{ s.stock }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="locked_stock" label="占用" width="80" align="right" />
              <el-table-column label="销量(总/30天)" width="140" align="right">
                <template #default="{ row: s }">
                  {{ (s.total_sold||0) }}/{{ (s.sold_30d||0) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="220" fixed="right">
                <template #default="{ row: s }">
                  <el-button type="primary" size="small" @click="handleSkuAdjust({ productName: sizeDrawerProduct.productName }, s)">调整</el-button>
                  <el-button type="warning" size="small" @click="handleSkuStocktake({ productName: sizeDrawerProduct.productName }, s)">盘点</el-button>
                  <el-button size="small" @click="exportSkuLogs(s.id)">流水</el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
          <el-empty v-else description="暂无尺码数据" />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
/* 现有通用样式保持 */
.inventory-query { padding: 16px; }

/* 快速筛选 */
.quick-filters { display:flex; align-items:center; gap:8px; margin-top:8px; }
.qf-label { color:#909399; font-size:12px; }

/* 行弱底色提示，保证对比度与可读性 */
:deep(.row-warning) .el-table__cell { background: #fff7e6; }
:deep(.row-danger) .el-table__cell { background: #fff1f0; }

/* 胶囊尺码标签 */
.size-pill { display:inline-block; padding:2px 8px; border-radius:999px; background:#f5f7fa; color:#606266; font-weight:600; font-size:12px; }
.size-pill.warn { background:#fff7e6; color:#ad6800; }
.size-pill.danger { background:#fff1f0; color:#a8071a; }

/* 文本省略 */
.text-ellipsis { max-width: 160px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:bottom; }

/***** 新增：尺码库存横向紧凑展示样式 *****/
.size-inline { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
.size-chip { padding: 2px 8px; border-radius: 999px; background: #f5f7fa; color: #606266; font-weight: 600; font-size: 12px; line-height: 18px; }
.size-chip.warn { background: #fff7e6; color: #ad6800; }
.size-chip.danger { background: #fff1f0; color: #a8071a; }
.text-muted { color: #bbb; }

/* 其他紧凑样式保持 */
/* ...existing code... */
</style>
