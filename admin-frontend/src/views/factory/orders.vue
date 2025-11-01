<route lang="yaml">
meta:
  title: 工厂订单
  icon: ep:document
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FactoryAPI from '@/api/modules/factory'
import ProductsAPI from '@/api/modules/products'
import ProductExtAPI from '@/api/modules/productExt'

interface OrderItem { product_id: string|number; product_name?: string; sku_id?: string|number; size?: string; quantity: number; unit_cost: number; remark?: string }
interface OrderRow { id: number; order_no: string; status: string; expedite: boolean; total_cost: number; shipping_fee: number; createdAt: string; details?: any[]; source?: 'manual'|'auto_replenish'; production_started_at?: string; expected_finish_at?: string; finished_at?: string }

const loading = ref(false)
const list = ref<OrderRow[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const statusFilter = ref('')
const sourceFilter = ref('')

// 工厂设置
const settingsVisible = ref(false)
const settings = ref<{ daily_capacity: number; work_hours_per_day: number }>({ daily_capacity: 100, work_hours_per_day: 12 })
const loadSettings = async()=>{ try{ const r = await FactoryAPI.getSettings(); if (r?.data) { const d=r.data; settings.value = { daily_capacity: d.daily_capacity??settings.value.daily_capacity, work_hours_per_day: d.work_hours_per_day??settings.value.work_hours_per_day } } }catch{} }
const saveSettings = async()=>{ try{ await FactoryAPI.saveSettings(settings.value as any); ElMessage.success('已保存'); settingsVisible.value=false; loadList() }catch{ ElMessage.error('保存失败') } }

const STATUS_TEXT: Record<string,string> = { planned:'计划中', approved:'已批准', in_production:'生产中', completed:'已完成', shipped:'确认入库', cancelled:'已取消' }
const statusText = (s?: string) => STATUS_TEXT[String(s||'')] || (s||'-')
const statusTagType = (s?: string) => ({ planned:'info', approved:'success', in_production:'warning', completed:'', shipped:'success', cancelled:'info' } as Record<string, any>)[String(s||'')] || 'info'
const SOURCE_TEXT: Record<string,string> = { manual:'手动', auto_replenish:'自动补货' }
const sourceText = (s?: string) => SOURCE_TEXT[String(s||'')] || (s||'-')
const sourceTagType = (s?: string) => ({ manual:'info', auto_replenish:'success' } as Record<string, any>)[String(s||'')] || 'info'

const loadList = async () => {
  loading.value = true
  try {
    const res = await FactoryAPI.list({ page: page.value, size: size.value, status: statusFilter.value || undefined, source: sourceFilter.value || undefined })
    const rows = res?.data?.orders || []
    list.value = rows
    total.value = res?.data?.pagination?.total || rows.length
  } catch(e){ ElMessage.error('加载失败') } finally { loading.value = false }
}

// 进行中订单（看板用）
const inProgress = ref<OrderRow[]>([])
const loadInProgress = async () => {
  try { const r = await FactoryAPI.list({ page: 1, size: 100, status: 'in_production' }); inProgress.value = r?.data?.orders || [] } catch { inProgress.value = [] }
}
let timer: any = null
// 每秒强制刷新渲染用的时钟，驱动进度条连续流动
const nowMs = ref(Date.now())
let timerTick: any = null

const openCreate = () => {
  expedite.value = false
  remark.value = ''
  items.value = []
  selectedProduct.value = null
  skuList.value = []
  selSkuId.value = null
  selQty.value = 1
  selUnitCost.value = 0
  loadProducts()
  dialogVisible.value = true
}

const loadProducts = async () => {
  try { const res = await ProductsAPI.getProductList({ page:1, limit:200, status:'active' }); productList.value = res?.data?.products || [] } catch { productList.value=[] }
}

const pickProduct = async (p:any) => {
  selectedProduct.value = p
  selSkuId.value = null
  selQty.value = 1
  selUnitCost.value = Number(p.purchase_price || 0)
  try { const res = await ProductExtAPI.listSkus(String(p.id)); skuList.value = (res?.data||[]) } catch{ skuList.value=[] }
}

const addItem = () => {
  if (!selectedProduct.value) return
  const sku = skuList.value.find((s:any)=> String(s.id)===String(selSkuId.value))
  const sizeLabel = sku?.size || undefined
  const unit = selUnitCost.value || Number(selectedProduct.value.purchase_price||0) || 0
  const it: OrderItem = { product_id: selectedProduct.value.id, product_name: selectedProduct.value.name, sku_id: sku?.id, size: sizeLabel, quantity: selQty.value || 1, unit_cost: unit }
  items.value.push(it)
  // reset
  selSkuId.value = null; selQty.value = 1; selUnitCost.value = Number(selectedProduct.value.purchase_price||0)
}

const removeItem = (idx:number) => { items.value.splice(idx,1) }

const totalQty = computed(()=> items.value.reduce((s, it)=> s + Number(it.quantity||0), 0))
const totalCost = computed(()=> items.value.reduce((s, it)=> s + Number(it.unit_cost||0)*Number(it.quantity||0), 0))

const pct = (row: OrderRow) => {
  if (!row.production_started_at || !row.expected_finish_at) return 0
  const start = new Date(row.production_started_at).getTime()
  const end = new Date(row.expected_finish_at).getTime()
  const now = nowMs.value
  if (end <= start) return 0
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.floor(((now - start) / (end - start)) * 100)
}

const changeStatus = async (row: OrderRow, action: 'approve'|'start'|'complete'|'ship'|'cancel') => {
  try {
    const textMap: any = { approve:'批准', start:'开工', complete:'完成', ship:'确认入库', cancel:'取消' }
    await ElMessageBox.confirm(`确定执行 ${textMap[action]} ?`, '提示', { type:'warning' })
    if (action==='approve') await FactoryAPI.approve(row.id)
    if (action==='start') await FactoryAPI.start(row.id)
    if (action==='complete') await FactoryAPI.complete(row.id)
    if (action==='ship') await FactoryAPI.ship(row.id)
    if (action==='cancel') await FactoryAPI.cancel(row.id)
    ElMessage.success('操作成功')
    loadList(); loadSettings(); loadInProgress()
  } catch{}
}

// 顺序调整（仅非加急、approved）
const moveOrder = async (row: OrderRow, dir: 'up'|'down') => {
  try {
    await FactoryAPI.move(row.id, dir)
    loadList()
  } catch { ElMessage.error('调整失败') }
}

const dialogVisible = ref(false)
const expedite = ref(false)
const remark = ref('')
const items = ref<OrderItem[]>([])
const productList = ref<any[]>([])
const selectedProduct = ref<any|null>(null)
const skuList = ref<any[]>([])
const selSkuId = ref<string|number|null>(null)
const selQty = ref<number>(1)
const selUnitCost = ref<number>(0)

const submitCreate = async () => {
  try {
    if (!items.value.length) return ElMessage.warning('请先添加商品与尺码')
    const payload = { expedite: expedite.value, remark: remark.value, items: items.value }
    const res = await FactoryAPI.create(payload)
    if (res?.success!==false) {
      ElMessage.success('创建成功')
      dialogVisible.value = false
      loadList(); loadInProgress()
    }
  } catch { ElMessage.error('创建失败') }
}

const printInbound = (row: any) => {
  const url = `/api/factory/orders/${row.id}/print-inbound`
  window.open(url, '_blank')
}

const primaryActionText = (row: OrderRow) => {
  if (row.status==='planned') return '批准'
  if (row.status==='approved') return '开工'
  if (row.status==='in_production') return pct(row)>=100 ? '确认入库' : '完成'
  if (row.status==='completed') return '确认入库'
  return '查看'
}
const doPrimaryAction = async (row: OrderRow) => {
  const s = row.status
  if (s==='planned') return changeStatus(row,'approve')
  if (s==='approved') return changeStatus(row,'start')
  if (s==='in_production') return pct(row)>=100 ? changeStatus(row,'ship') : changeStatus(row,'complete')
  if (s==='completed') return changeStatus(row,'ship')
}

onMounted(()=>{ 
  loadSettings(); 
  loadList(); 
  loadInProgress(); 
  timer = setInterval(loadInProgress, 15000)
  // 每秒刷新“当前时间”触发进度条更新
  timerTick = setInterval(()=>{ nowMs.value = Date.now() }, 1000)
})
onUnmounted(()=>{ if (timer) clearInterval(timer); if (timerTick) clearInterval(timerTick) })
</script>

<template>
  <div class="p-4">
    <el-card class="mb-4">
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
          </el-select>
        </el-form-item>
        <el-button type="primary" @click="openCreate">新建工厂订单</el-button>
        <el-button @click="()=>settingsVisible=true">工厂设置</el-button>
        <el-button text type="primary" @click="loadInProgress">刷新进行中</el-button>
      </el-form>
    </el-card>

    <!-- 进行中订单进度条 -->
    <el-card class="mb-4" v-if="inProgress.length">
      <template #header>
        <div class="flex items-center justify-between">
          <span>进行中订单</span>
          <el-tag type="warning" size="small">自动每15秒刷新</el-tag>
        </div>
      </template>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <el-card v-for="o in inProgress" :key="o.id" shadow="hover">
          <div class="flex items-center justify-between mb-2">
            <div class="font-600">{{ o.order_no }}</div>
            <el-tag :type="pct(o)>=100 ? 'success' : 'warning'" size="small">{{ pct(o)>=100 ? '生产完毕，待确认' : '生产中' }}</el-tag>
          </div>
          <el-progress :percentage="pct(o)" :stroke-width="10" status="success" />
          <div class="mt-2 text-xs text-gray-500">
            <span>开始：{{ o.production_started_at || '-' }}</span>
            <span class="ml-3">预计完成：{{ o.expected_finish_at || '-' }}</span>
          </div>
          <div class="mt-2 text-right">
            <el-button size="small" @click="changeStatus(o,'complete')">完成</el-button>
            <el-button size="small" type="primary" @click="changeStatus(o,'ship')">确认入库</el-button>
            <el-button size="small" text @click="printInbound(o)">打印入库单</el-button>
          </div>
        </el-card>
      </div>
    </el-card>

    <el-card>
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column type="expand">
          <template #default="{ row }">
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="生产开始">{{ row.production_started_at || '-' }}</el-descriptions-item>
              <el-descriptions-item label="预计完成">{{ row.expected_finish_at || '-' }}</el-descriptions-item>
              <el-descriptions-item label="实际完成">{{ row.finished_at || '-' }}</el-descriptions-item>
              <el-descriptions-item label="当前进度">
                <el-progress :percentage="pct(row)" style="width:220px" />
              </el-descriptions-item>
            </el-descriptions>
            <el-table :data="row.details || []" size="small" class="mt-2">
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
            </el-table>
          </template>
        </el-table-column>
        <el-table-column prop="order_no" label="工厂单号" width="160" />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="110">
          <template #default="{ row }"><el-tag :type="sourceTagType(row.source)" size="small">{{ sourceText(row.source) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="加急" width="80">
          <template #default="{ row }"><el-tag v-if="row.expedite" type="danger" size="small">加急</el-tag><span v-else>-</span></template>
        </el-table-column>
        <el-table-column prop="total_cost" label="合计成本" width="120" align="right">
          <template #default="{ row }">¥{{ Number(row.total_cost||0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="360" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="doPrimaryAction(row)">{{ primaryActionText(row) }}</el-button>
            <el-dropdown>
              <el-button size="small" text>更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="printInbound(row)">打印入库单</el-dropdown-item>
                  <el-dropdown-item :disabled="!(row.status==='approved' && !row.expedite)" @click="moveOrder(row,'up')">上移</el-dropdown-item>
                  <el-dropdown-item :disabled="!(row.status==='approved' && !row.expedite)" @click="moveOrder(row,'down')">下移</el-dropdown-item>
                  <el-dropdown-item divided type="danger" :disabled="['shipped','cancelled'].includes(row.status)" @click="changeStatus(row,'cancel')">取消订单</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <div class="mt-3" style="text-align:right">
        <el-pagination v-model:current-page="page" v-model:page-size="size" :total="total" layout="total, sizes, prev, pager, next, jumper" @current-change="loadList" @size-change="loadList" />
      </div>
    </el-card>

    <!-- 工厂设置 -->
    <el-dialog v-model="settingsVisible" title="工厂设置" width="520px">
      <el-form label-width="140px">
        <el-form-item label="日产能（件）"><el-input-number v-model="settings.daily_capacity" :min="1" :step="10" /></el-form-item>
        <el-form-item label="工时/日（小时）"><el-input-number v-model="settings.work_hours_per_day" :min="1" :max="24" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settingsVisible=false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建工厂订单 -->
    <el-dialog v-model="dialogVisible" title="新建工厂订单" width="820px">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <el-card shadow="never">
          <template #header>选择商品与尺码</template>
          <el-form label-width="90px">
            <el-form-item label="商品">
              <el-select v-model="selectedProduct" value-key="id" filterable style="width:100%" placeholder="选择商品" @change="pickProduct">
                <el-option v-for="p in productList" :key="p.id" :label="p.name" :value="p" />
              </el-select>
            </el-form-item>
            <el-form-item label="尺码SKU">
              <div class="flex items-center gap-2 w-full">
                <el-select v-model="selSkuId" filterable style="flex:1" placeholder="选择尺码">
                  <el-option v-for="s in skuList" :key="s.id" :label="s.size" :value="s.id" />
                </el-select>
                <el-input-number v-model="selQty" :min="1" />
              </div>
            </el-form-item>
            <el-form-item label="单价(元)">
              <el-input-number v-model="selUnitCost" :precision="2" :step="0.5" :min="0" />
            </el-form-item>
            <div class="text-right">
              <el-button @click="addItem" type="primary" plain>加入明细</el-button>
            </div>
          </el-form>
        </el-card>
        <el-card shadow="never">
          <template #header>订单参数</template>
          <el-form label-width="100px">
            <el-form-item label="加急"><el-switch v-model="expedite" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="remark" placeholder="可填写生产要求、备忘等" type="textarea" :rows="3" /></el-form-item>
            <el-alert title="说明：运费已取消（工厂在仓边）。生产完成后系统会自动入库，或在订单完成后点击【确认入库】。" type="info" show-icon />
          </el-form>
          <div class="mt-2 text-right" style="font-size:12px; color:#909399;">
            共 {{ totalQty }} 件，预估金额 ¥{{ Number(totalCost||0).toFixed(2) }}
          </div>
        </el-card>
      </div>
      <el-divider />
      <el-table :data="items" size="small" height="260" empty-text="请在左侧选择商品与尺码后加入明细">
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
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :disabled="!items.length" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
</style>
