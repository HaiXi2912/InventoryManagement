<route lang="yaml">
meta:
  title: 订货管理
  icon: ep:office-building
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FactoryAPI from '@/api/modules/factory'
import ProductsAPI from '@/api/modules/products'
import ProductExtAPI from '@/api/modules/productExt'

interface OrderItem { product_id: string|number; product_name?: string; sku_id?: string|number; size?: string; quantity: number; unit_cost: number; remark?: string }
interface OrderRow { id: number; order_no: string; status: string; expedite: boolean; total_cost: number; shipping_fee: number; remark?: string; createdAt: string; details?: any[]; source?: 'manual'|'auto_replenish'|'migration' }

// 列表与筛选
const loading = ref(false)
const list = ref<OrderRow[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const statusFilter = ref('')
const keyword = ref('')
const sourceFilter = ref('')

// 新建订货单对话框
const dialogVisible = ref(false)
const expedite = ref(false)
const remark = ref('')
const items = ref<OrderItem[]>([])

// 商品/尺码选择
const productList = ref<any[]>([])
const productKeyword = ref('')
const selectedProduct = ref<any | null>(null)
const skuList = ref<Array<{ id: string|number; size: string; stock?: number }>>([])
const multiSkuRows = ref<Array<{ sku_id: string|number; size: string; qty: number; unit_cost: number }>>([])

const sizeTemplate = ref<'apparel'|'full'|'kids'|'one'>('apparel')
const fillQty = ref<number>(0)
const copyFromProductId = ref<string>('')

const skuStocks = ref<Array<{id:string|number,size:string,stock:number,locked:number,reorder_threshold?:number|null,reorder_target?:number|null}>>([])
const minThreshold = ref<number>(5)
const planTarget = ref<number>(20)

// 状态/来源 本地化映射
const STATUS_TEXT: Record<string,string> = { planned:'计划中', approved:'已批准', in_production:'生产中', completed:'已完成', shipped:'确认入库', cancelled:'已取消' }
const statusText = (s?: string) => STATUS_TEXT[String(s||'')] || (s||'-')
const statusTagType = (s?: string) => ({ planned:'info', approved:'success', in_production:'warning', completed:'', shipped:'success', cancelled:'info' } as Record<string, any>)[String(s||'')] || 'info'
const ACTION_TEXT: Record<string,string> = { approve:'批准', start:'开工', complete:'完成', ship:'确认入库', cancel:'取消' }

// 尺码助手
const sizeHelperVisible = ref(false)
const presetKey = ref<'apparel'|'kids'|'shoes'|'custom'>('apparel')
const rangeFrom = ref<number|null>(36)
const rangeTo = ref<number|null>(44)
const rangeStep = ref<number>(1)
const customSizesText = ref('')
const genSizes = ref<string[]>([])

const filteredProducts = computed(()=>{
  const kw = (productKeyword.value||'').trim().toLowerCase()
  if(!kw) return productList.value
  return productList.value.filter((p:any)=> (p.name||'').toLowerCase().includes(kw) || (p.code||'').toLowerCase().includes(kw) || (p.barcode||'').toLowerCase().includes(kw))
})

const loadList = async () => {
  loading.value = true
  try {
    const res = await FactoryAPI.list({ page: page.value, size: size.value, status: statusFilter.value || undefined, keyword: keyword.value || undefined, source: sourceFilter.value || undefined })
    const rows = res?.data?.orders || []
    list.value = rows
    total.value = res?.data?.pagination?.total || rows.length
  } catch(e){ ElMessage.error('加载失败') } finally { loading.value = false }
}

const openCreate = () => {
  expedite.value = false
  remark.value = ''
  items.value = []
  selectedProduct.value = null
  skuList.value = []
  multiSkuRows.value = []
  dialogVisible.value = true
}

const loadProducts = async () => {
  try {
    const res = await ProductsAPI.getProductList({ page:1, limit:300, status:'active' })
    productList.value = res?.data?.products || []
  } catch { productList.value=[] }
}

const refreshSkuStocks = async () => {
  if (!selectedProduct.value) return
  try { const res = await ProductExtAPI.listSkuStocks(String(selectedProduct.value.id)); skuStocks.value = res?.data || [] } catch { skuStocks.value = [] }
}

const saveReorderConfig = async () => {
  if (!selectedProduct.value) return
  try {
    const payload = skuStocks.value.map(s=>({ id: s.id, reorder_threshold: s.reorder_threshold ?? null, reorder_target: s.reorder_target ?? null }))
    await ProductExtAPI.saveReorderConfig(String(selectedProduct.value.id), payload)
    ElMessage.success('阈值/目标已保存')
  } catch { ElMessage.error('保存失败') }
}

const applyReorderToAll = () => {
  for (const s of skuStocks.value){ s.reorder_threshold = Number(minThreshold.value||0); s.reorder_target = Number(planTarget.value||0) }
}

const autoReplenishSingle = async () => {
  if (!selectedProduct.value) { ElMessage.warning('请先选择商品'); return }
  try {
    const unit = Number(selectedProduct.value?.purchase_price||0)
    const resp = await FactoryAPI.autoReplenishByProduct({ product_id: String(selectedProduct.value.id), threshold: Number(minThreshold.value||5), plan: Number(planTarget.value||20), unit_cost: unit })
    if (resp?.data?.items > 0) { ElMessage.success('已生成自动补货订单'); dialogVisible.value=false; loadList() } else { ElMessage.info('无需补货') }
  } catch { ElMessage.error('生成失败') }
}

const pickProduct = async (p:any) => {
  selectedProduct.value = p
  try {
    const res = await ProductExtAPI.listSkus(String(p.id))
    const arr = Array.isArray(res?.data) ? res?.data : (res?.data?.skus || [])
    skuList.value = (arr||[]).map((s:any)=>({ id: s.id, size: s.size, stock: s.stock }))
    const unit = Number(p.purchase_price||0)
    multiSkuRows.value = skuList.value.map(s=>({ sku_id: s.id, size: s.size, qty: 0, unit_cost: unit }))
    await refreshSkuStocks()
  } catch { skuList.value=[]; multiSkuRows.value=[]; skuStocks.value=[] }
}

const addSelectedSizes = () => {
  if (!selectedProduct.value) return
  const rows = multiSkuRows.value.filter(r=> Number(r.qty)>0)
  if (!rows.length) { ElMessage.warning('请填写各尺码的数量'); return }
  for(const r of rows){
    items.value.push({ product_id: selectedProduct.value.id, product_name: selectedProduct.value.name, sku_id: r.sku_id, size: r.size, quantity: Number(r.qty||0), unit_cost: Number(r.unit_cost||0) })
  }
  // 清零已加入的数量，便于继续选择
  multiSkuRows.value = multiSkuRows.value.map(r=>({ ...r, qty: 0 }))
}

const removeItem = (idx:number) => { items.value.splice(idx,1) }

const totalCost = computed(()=> items.value.reduce((s, it)=> s + Number(it.unit_cost||0)*Number(it.quantity||0), 0))

const submit = async () => {
  if (!items.value.length) { ElMessage.warning('请先添加明细'); return }
  try {
    await FactoryAPI.create({ expedite: expedite.value, remark: remark.value, items: items.value.map(i=>({ product_id: Number(i.product_id), sku_id: i.sku_id?Number(i.sku_id):undefined, size: i.size, quantity: Number(i.quantity||0), unit_cost: Number(i.unit_cost||0), remark: i.remark })) })
    ElMessage.success('提交成功')
    dialogVisible.value = false
    loadList()
  } catch(e){ ElMessage.error('提交失败') }
}

const changeStatus = async (row: OrderRow, action: 'approve'|'start'|'complete'|'ship'|'cancel') => {
  try {
    await ElMessageBox.confirm(`确定执行 ${ACTION_TEXT[action]} ?`, '提示', { type:'warning' })
    if (action==='approve') await FactoryAPI.approve(row.id)
    if (action==='start') await FactoryAPI.start(row.id)
    if (action==='complete') await FactoryAPI.complete(row.id)
    if (action==='ship') await FactoryAPI.ship(row.id)
    if (action==='cancel') await FactoryAPI.cancel(row.id)
    ElMessage.success('操作成功')
    loadList()
  } catch{}
}

const toggleExpedite = async (row: OrderRow) => {
  try {
    if (!['planned','approved'].includes(row.status)) { ElMessage.warning('当前状态不可修改加急'); return }
    await FactoryAPI.update(row.id, { expedite: !row.expedite })
    ElMessage.success('已更新加急状态')
    loadList()
  } catch { ElMessage.error('更新失败') }
}

const triggerAutoReplenish = async () => {
  try { await FactoryAPI.autoReplenish(); ElMessage.success('已触发自动补货'); loadList() } catch { ElMessage.error('触发失败') }
}

const genSkusByTemplate = async () => {
  if (!selectedProduct.value) { ElMessage.warning('请先选择商品'); return }
  try {
    await ProductExtAPI.batchCreateSkusBySize(String(selectedProduct.value.id), { template: sizeTemplate.value })
    ElMessage.success('已批量生成SKU')
    await pickProduct(selectedProduct.value) // 重新加载尺码
  } catch { ElMessage.error('生成失败') }
}

const copySkus = async () => {
  if (!selectedProduct.value) { ElMessage.warning('请先选择商品'); return }
  if (!copyFromProductId.value) { ElMessage.warning('请输入来源商品ID'); return }
  try {
    await ProductExtAPI.copySkusFrom(String(selectedProduct.value.id), copyFromProductId.value, {})
    ElMessage.success('已复制SKU')
    await pickProduct(selectedProduct.value)
  } catch { ElMessage.error('复制失败') }
}

const oneClickFillQty = () => {
  const v = Number(fillQty.value||0); if (v<=0) { ElMessage.warning('请输入数量'); return }
  multiSkuRows.value = multiSkuRows.value.map(r=>({ ...r, qty: v }))
}

// 尺码网格快速下单
const quickGrid = ref(false)
const gridUnitCost = ref<number | null>(null)
const gridMap = ref<Record<string, number>>({})

const initGridFromSkus = () => {
  const map: Record<string, number> = {}
  for(const s of skuList.value){ map[String(s.size)] = 0 }
  gridMap.value = map
  gridUnitCost.value = Number(selectedProduct.value?.purchase_price||0)
}

const submitQuickGrid = async () => {
  if (!selectedProduct.value) { ElMessage.warning('请先选择商品'); return }
  if (!Object.values(gridMap.value).some(v=>Number(v)>0)) { ElMessage.warning('请至少填写一个尺码数量'); return }
  try {
    await FactoryAPI.quickAdd({ product_id: selectedProduct.value.id, size_quantities: gridMap.value, unit_cost: gridUnitCost.value||0, expedite: expedite.value, remark: remark.value })
    ElMessage.success('提交成功')
    dialogVisible.value = false
    loadList()
  } catch { ElMessage.error('提交失败') }
}

const simplifiedAuto = ref<'none'|'approve'|'start'|'complete'|'ship'>('none')
const simplifiedSubmit = async () => {
  if (!selectedProduct.value) { ElMessage.warning('请先选择商品'); return }
  // 使用当前网格或行编辑数据
  let map: Record<string, number> = {}
  if (quickGrid.value) {
    map = { ...gridMap.value }
  } else {
    for (const r of multiSkuRows.value) { const n = Number(r.qty||0); if (n>0) map[String(r.size)] = n }
  }
  if (!Object.values(map).some(v=>Number(v)>0)) { ElMessage.warning('请至少填写一个尺码数量'); return }
  try {
    await FactoryAPI.simplified({ product_id: selectedProduct.value.id, size_quantities: map, unit_cost: gridUnitCost.value ?? Number(selectedProduct.value?.purchase_price||0), expedite: expedite.value, remark: remark.value, auto: simplifiedAuto.value })
    ElMessage.success('提交成功')
    dialogVisible.value = false
    loadList()
  } catch { ElMessage.error('提交失败') }
}

// 提交来源提示
const orderSourceHint = computed(()=> '本页面创建的工厂订单均为手动提交（来源：手动）。自动补货单由库存变动自动生成，可在列表按“来源=自动补货”筛选查看。')

// 低库存标色
const stockTagType = (s: {stock:number; reorder_threshold?:number|null}) => {
  const th = Number(s.reorder_threshold ?? minThreshold.value ?? 0)
  if (th > 0 && Number(s.stock||0) < th) return 'danger'
  return 'success'
}

// 尺码助手逻辑
const SIZE_PRESETS: Record<string, string[]> = {
  apparel: ['XS','S','M','L','XL','XXL'],
  kids: ['100','110','120','130','140','150','160']
}
const generateSizes = () => {
  if (presetKey.value === 'apparel') { genSizes.value = SIZE_PRESETS.apparel.slice() }
  else if (presetKey.value === 'kids') { genSizes.value = SIZE_PRESETS.kids.slice() }
  else if (presetKey.value === 'shoes') {
    const from = Number(rangeFrom.value||0), to = Number(rangeTo.value||0), step = Math.max(1, Number(rangeStep.value||1))
    const arr:string[] = []; if (to>=from){ for(let v=from; v<=to; v+=step){ arr.push(String(v)) } }
    genSizes.value = arr
  } else {
    const text = customSizesText.value || ''
    const arr = text.split(/[\s,;，；\n\r]+/).map(s=>s.trim()).filter(Boolean)
    genSizes.value = Array.from(new Set(arr))
  }
}
const ensureSkusForGenSizes = async () => {
  if (!selectedProduct.value) { ElMessage.warning('请先选择商品'); return }
  if (!genSizes.value.length) { ElMessage.warning('请先生成尺码'); return }
  try {
    await ProductExtAPI.batchCreateSkusBySize(String(selectedProduct.value.id), { sizes: genSizes.value })
    ElMessage.success('已补齐/生成SKU')
    await pickProduct(selectedProduct.value)
    await refreshSkuStocks()
  } catch { ElMessage.error('生成失败') }
}
const applyGenSizesToGrid = () => {
  if (!genSizes.value.length) { ElMessage.warning('请先生成尺码'); return }
  const map: Record<string, number> = { ...gridMap.value }
  genSizes.value.forEach(sz=>{ map[String(sz)] = map[String(sz)] ?? 0 })
  gridMap.value = map
  if (!quickGrid.value) initGridFromSkus()
  ElMessage.success('已应用到网格/行编辑')
}

onMounted(()=>{ loadList(); loadProducts() })
</script>

<template>
  <div class="p-4">
    <el-card class="mb-4" shadow="never">
      <template #header>筛选</template>
      <el-form inline>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable style="width:160px" @change="()=>{page=1;loadList()}">
            <el-option label="全部" value="" />
            <el-option label="计划中" value="planned" />
            <el-option label="已批准" value="approved" />
            <el-option label="生产中" value="in_production" />
            <el-option label="已完成" value="completed" />
            <el-option label="确认入库" value="shipped" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="sourceFilter" clearable style="width:160px" @change="()=>{page=1;loadList()}">
            <el-option label="全部" value="" />
            <el-option label="手动" value="manual" />
            <el-option label="自动补货" value="auto_replenish" />
            <el-option label="迁移" value="migration" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键字">
          <el-input v-model="keyword" placeholder="工厂单号" style="width:200px" clearable @keyup.enter="()=>{page=1;loadList()}" />
        </el-form-item>
        <el-button type="primary" @click="openCreate">新建订货单</el-button>
        <el-button @click="triggerAutoReplenish">自动补货</el-button>
      </el-form>
      <el-alert class="mt-3" type="info" show-icon :closable="false">
        <template #default>
          销售确认后若SKU库存低于商品安全库存或SKU阈值，会自动生成工厂订单。也可点击“自动补货”立即扫描补货。
        </template>
      </el-alert>
    </el-card>

    <el-card shadow="never">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column type="expand">
          <template #default="{ row }">
            <el-table :data="row.details || []" size="small">
              <el-table-column label="商品" prop="product.name" min-width="160">
                <template #default="{ row: d }">{{ d.product?.name || '-' }}</template>
              </el-table-column>
              <el-table-column label="尺码" prop="size" width="90" />
              <el-table-column label="数量" prop="quantity" width="90" align="center" />
              <el-table-column label="单价" width="110" align="right">
                <template #default="{ row: d }">¥{{ Number(d.unit_cost||0).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="小计" width="120" align="right">
                <template #default="{ row: d }">¥{{ Number(d.subtotal_cost||0).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="备注" prop="remark" min-width="120" />
            </el-table>
          </template>
        </el-table-column>
        <el-table-column prop="order_no" label="工厂单号" width="160" />
        <el-table-column prop="source" label="来源" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="row.source==='auto_replenish' ? 'success' : (row.source==='migration' ? 'warning' : 'info')">
              {{ row.source==='auto_replenish' ? '自动' : (row.source==='migration' ? '迁移' : '手动') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="加急" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.expedite" type="danger" size="small">加急</el-tag>
            <el-button v-else link size="小" @click="toggleExpedite(row)" :disabled="!['planned','approved'].includes(row.status)">申请加急</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="total_cost" label="合计成本" width="120" align="right">
          <template #default="{ row }">¥{{ Number(row.total_cost||0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="420" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="changeStatus(row,'approve')" :disabled="!['planned'].includes(row.status)">批准</el-button>
            <el-button size="small" @click="changeStatus(row,'start')" :disabled="!['approved'].includes(row.status)">开工</el-button>
            <el-button size="small" @click="changeStatus(row,'complete')" :disabled="!['in_production'].includes(row.status)">完成</el-button>
            <el-button size="small" @click="changeStatus(row,'ship')" :disabled="!['completed'].includes(row.status)">确认入库</el-button>
            <el-button size="small" type="danger" @click="changeStatus(row,'cancel')" :disabled="['shipped','cancelled'].includes(row.status)">取消</el-button>
            <el-button size="small" text @click="toggleExpedite(row)" :disabled="!['planned','approved'].includes(row.status)">{{ row.expedite? '取消加急':'设为加急' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="mt-3" style="text-align:right">
        <el-pagination v-model:current-page="page" v-model:page-size="size" :total="total" layout="total, sizes, prev, pager, next, jumper" @current-change="loadList" @size-change="loadList" />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新建订货单（工厂生产）" width="85%">
      <el-form label-width="80px">
        <el-form-item label="加急"><el-switch v-model="expedite" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="remark" placeholder="可填写交期、颜色等" /></el-form-item>
      </el-form>

      <el-row :gutter="12">
        <el-col :span="12">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px">
            <b>商品</b>
            <el-input v-model="productKeyword" placeholder="按名称/编码/条码过滤" clearable style="max-width:220px" />
          </div>
          <el-table :data="filteredProducts" height="360" @row-click="pickProduct">
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="category" label="分类" width="100" />
            <el-table-column prop="purchase_price" label="成本价" width="100" align="right">
              <template #default="{ row }">¥{{ Number(row.purchase_price||0).toFixed(2) }}</template>
            </el-table-column>
          </el-table>
        </el-col>
        <el-col :span="12">
          <div v-if="selectedProduct" style="margin-bottom:8px; font-weight:600">{{ selectedProduct.name }} - 按尺码录入</div>

          <el-card v-if="selectedProduct" class="mb-2" shadow="never">
            <template #header>尺码库存</template>
            <div style="display:flex; flex-wrap:wrap; gap:10px">
              <div v-for="s in skuStocks" :key="String(s.id)" style="display:flex; align-items:center; gap:6px">
                <el-tag>{{ s.size }}</el-tag>
                <el-tag :type="stockTagType(s)">库存 {{ s.stock }}</el-tag>
                <el-tag type="warning">占用 {{ s.locked }}</el-tag>
                <el-input-number v-model.number="s.reorder_threshold" :min="0" :max="9999" :step="1" size="small" placeholder="阈值" />
                <el-input-number v-model.number="s.reorder_target" :min="0" :max="99999" :step="1" size="small" placeholder="目标" />
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:8px">
              <span>默认阈值</span><el-input-number v-model="minThreshold" :min="0" :max="9999" />
              <span>默认目标</span><el-input-number v-model="planTarget" :min="0" :max="9999" />
              <el-button size="small" @click="applyReorderToAll">应用到所有尺码</el-button>
              <el-button size="small" type="primary" @click="autoReplenishSingle">单商品自动补货</el-button>
              <el-button size="small" @click="saveReorderConfig">保存阈值/目标</el-button>
              <el-button size="small" @click="refreshSkuStocks">刷新库存</el-button>
            </div>
          </el-card>

          <!-- 原有尺码编辑/网格/极简 一并保留 -->
          <div v-if="selectedProduct" class="mb-2" style="display:flex; gap:8px; align-items:center; flex-wrap: wrap;">
            <el-switch v-model="quickGrid" active-text="尺码网格快速下单" @change="initGridFromSkus" />
            <el-button size="small" @click="sizeHelperVisible=true">尺码助手</el-button>
            <!-- 原有模板/复制/一键填充 -->
            <el-select v-model="sizeTemplate" style="width:160px" v-if="!quickGrid">
              <el-option label="通用服装(XS-XXL)" value="apparel" />
              <el-option label="全尺码(XS-XXXL)" value="full" />
              <el-option label="童装(100-160)" value="kids" />
              <el-option label="均码" value="one" />
            </el-select>
            <el-button size="small" @click="genSkusByTemplate" v-if="!quickGrid">按模板生成SKU</el-button>
            <el-input v-model="copyFromProductId" placeholder="来源商品ID" style="width:160px" v-if="!quickGrid" />
            <el-button size="small" @click="copySkus" v-if="!quickGrid">从商品复制SKU</el-button>
            <span style="flex:1"></span>
            <el-input-number v-model="fillQty" :min="0" :max="9999" :step="1" v-if="!quickGrid" />
            <el-button size="small" @click="oneClickFillQty" v-if="!quickGrid">一键填充数量</el-button>
          </div>

          <div v-if="quickGrid && selectedProduct" class="mb-2">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:6px">
              <span>统一成本价</span>
              <el-input-number v-model="gridUnitCost" :min="0" :step="0.5" />
              <el-button size="small" type="primary" @click="submitQuickGrid">网格下单并提交</el-button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px">
              <div v-for="s in skuList" :key="String(s.id)" style="display:flex; align-items:center; gap:6px">
                <el-tag type="info" style="min-width:48px; text-align:center">{{ s.size }}</el-tag>
                <el-input-number v-model.number="gridMap[String(s.size)]" :min="0" :max="9999" :step="1" />
                <span v-if="skuStocks.find(ss=>ss.size===s.size)" style="color:#909399;font-size:12px">库存 {{ skuStocks.find(ss=>ss.size===s.size)?.stock ?? 0 }}</span>
              </div>
            </div>
            <el-divider />
          </div>

          <el-table v-if="!quickGrid && selectedProduct" :data="multiSkuRows" size="small" style="margin-bottom:8px">
            <el-table-column prop="size" label="尺码" width="120" />
            <el-table-column label="数量" width="150">
              <template #default="{ row }"><el-input-number v-model.number="row.qty" :min="0" :max="9999" :step="1" /></template>
            </el-table-column>
            <el-table-column label="成本价" width="160" align="right">
              <template #default="{ row }"><el-input-number v-model.number="row.unit_cost" :min="0" :step="0.5" /></template>
            </el-table-column>
            <el-table-column label="小计" width="140" align="right">
              <template #default="{ row }">¥{{ (Number(row.unit_cost||0)*Number(row.qty||0)).toFixed(2) }}</template>
            </el-table-column>
          </el-table>

          <div v-if="selectedProduct" style="text-align:right">
            <el-button @click="addSelectedSizes">加入明细</el-button>
          </div>
        </el-col>
      </el-row>

      <el-divider />

      <el-table :data="items" size="small" height="260">
        <el-table-column label="#" type="index" width="50" />
        <el-table-column label="商品" prop="product_name" min-width="160" />
        <el-table-column label="尺码" prop="size" width="100" />
        <el-table-column label="数量" prop="quantity" width="100" align="center" />
        <el-table-column label="单价(元)" width="120" align="right">
          <template #default="{ row }">{{ Number(row.unit_cost||0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ $index }">
            <el-button size="small" type="danger" text @click="removeItem($index)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div style="flex:1; text-align:left">合计：¥{{ totalCost.toFixed(2) }}</div>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :disabled="!items.length" @click="submit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
</style>
