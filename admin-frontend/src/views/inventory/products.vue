<route lang="yaml">
meta:
  title: 商品管理
  icon: ep:goods
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import productExtApi, { type ProductContentPayload, type ProductMediaPayload, type ProductSkuPayload } from '@/api/modules/productExt'
import { ElMessage, ElMessageBox } from 'element-plus'
import productsApi from '@/api/modules/products'

// 商品数据接口
interface Product {
  id: string
  name: string
  category: string
  price: number
  stock: number // 展示为 SKU 汇总库存
  minStock: number
  status: 'active' | 'inactive'
  createTime: string
  updateTime: string
}

// 响应式数据
const loading = ref(false)
const searchForm = ref({
  keyword: '',
  category: ''
})

const products = ref<Product[]>([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)

// 对话框相关
const dialogVisible = ref(false)
const dialogTitle = ref('添加商品')
// 新增：编辑弹窗激活页签（新增默认基础信息，编辑默认尺码信息管理）
const activeTab = ref<'base'|'content'|'media'|'skus'>('base')
const productForm = ref<Product>({
  id: '',
  name: '',
  category: '',
  price: 0,
  stock: 0,
  minStock: 0,
  status: 'active',
  createTime: '',
  updateTime: ''
})

const productFormRef = ref<FormInstance>()
const productFormRules: FormRules = {
  name: [
    { required: true, message: '请输入商品名称', trigger: 'blur' }
  ],
  category: [
    { required: true, message: '请选择商品分类', trigger: 'change' }
  ],
  price: [
    { required: true, message: '请输入商品价格', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '价格必须大于0', trigger: 'blur' }
  ],
  // 商品不再提供聚合库存编辑入口，移除 stock 校验
  minStock: [
    { required: true, message: '请输入最低库存', trigger: 'blur' },
    { type: 'number', min: 0, message: '最低库存不能为负数', trigger: 'blur' }
  ],
  // supplier: []
}

// 分类选项（服装行业）
const categories = [
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
]

// 商品列表：尺码库存按需加载与预取
interface ListSkuItem { id: number|string; size: string; stock: number }
const skuMap = ref<Record<string | number, { loading: boolean; list: ListSkuItem[] }>>({})

const ensureSkusLoaded = async (productId: string | number) => {
  if (!productId) return
  const entry = skuMap.value[productId]
  if (entry && (entry.loading || (entry.list && entry.list.length))) return
  skuMap.value[productId] = { loading: true, list: entry?.list || [] }
  try {
    const res = await productExtApi.listSkus(productId)
    const list = (res as any).data || []
    skuMap.value[productId].list = list.map((s: any) => ({ id: s.id, size: s.size, stock: Number(s.stock || 0) }))
  } catch (_) {
    // 忽略单项失败
    skuMap.value[productId].list = []
  } finally {
    skuMap.value[productId].loading = false
  }
}

const prefetchSkusForVisibleRows = async () => {
  const ids = (products.value || []).map(p => p.id).filter(Boolean)
  if (!ids.length) return
  const concurrency = 4
  let idx = 0
  const runNext = async (): Promise<void> => {
    if (idx >= ids.length) return
    const id = ids[idx++]
    try { await ensureSkusLoaded(id) } catch {}
    return runNext()
  }
  const workers = Array(Math.min(concurrency, ids.length)).fill(0).map(() => runNext())
  await Promise.allSettled(workers)
}

// 获取商品列表
const getProducts = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      category: searchForm.value.category || undefined,
      // 已移除 status 参数，统一通过“下架(软删除)”控制隐藏
    }
    const res = await productsApi.getProductList(params)
    // 后端/拦截器统一返回 { success, message, data }
    if (res.success !== true) throw new Error(res.message || '获取商品列表失败')

    const list = res.data?.products ?? []
    products.value = list.map((p: any) => ({
      id: String(p.id),
      name: p.name,
      category: p.category || '',
      // 价格优先展示零售价，其次批发价/进货价
      price: Number(p.retail_price ?? p.wholesale_price ?? p.purchase_price ?? 0),
      // 库存来自 include 的 inventory.current_stock
      stock: Number(p.sku_stock_sum ?? 0),
      minStock: Number(p.min_stock ?? 0),
      // 已移除供应商
      // 后端有 active/inactive/discontinued，这里将 discontinued 视为 inactive 展示
      status: p.status === 'active' ? 'active' : 'inactive',
      createTime: String(p.createdAt ?? p.created_at ?? ''),
      updateTime: String(p.updatedAt ?? p.updated_at ?? ''),
    }))
    total.value = Number(res.data?.pagination?.total_count ?? 0)

    // 异步预取当前页商品的 SKU，便于列表直接显示尺码库存（不阻塞）
    setTimeout(() => { prefetchSkusForVisibleRows() }, 0)
  } catch (error: any) {
    ElMessage.error(error?.message || '获取商品列表失败')
    products.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  currentPage.value = 1
  getProducts()
}

// 重置搜索
const handleReset = () => {
  searchForm.value = {
    keyword: '',
    category: ''
  }
  currentPage.value = 1
  getProducts()
}

// 新增商品
const handleAdd = () => {
  dialogTitle.value = '添加商品'
  productForm.value = {
    id: '',
    name: '',
    category: '',
    price: 0,
    stock: 0,
    minStock: 0,
    status: 'active',
    createTime: '',
    updateTime: ''
  }
  activeTab.value = 'base'
  dialogVisible.value = true
}

// 编辑商品（默认打开尺码管理）
const handleEdit = (row: Product) => {
  dialogTitle.value = '编辑商品'
  productForm.value = { ...row }
  activeTab.value = 'skus'
  dialogVisible.value = true
}

// 删除商品（软删除）
const handleDelete = async (row: Product) => {
  try {
    await ElMessageBox.confirm(
      `确定要下架商品 "${row.name}" 吗？该操作会将商品标记为已下架（软删除），在列表中不再展示。`,
      '确认下架',
      {
        confirmButtonText: '下架',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    await productsApi.deleteProduct(row.id)
    ElMessage.success('已下架')
    getProducts()
  } catch (error) {
    // 用户取消或失败
  }
}

// 新增：SKU 批量创建与数量分配工具
const bulkQty = ref<number | null>(null)
function fillAllQty(){
  const v = Number(bulkQty.value||0); if(v<0) return; newSkuMatrix.value.forEach(r=>{ r.stock = v })
}
function clearAllQty(){ newSkuMatrix.value.forEach(r=>{ r.stock = 0 }) }
function copyPrevQty(i:number){ if(i>0){ newSkuMatrix.value[i].stock = Number(newSkuMatrix.value[i-1].stock||0) } }

async function batchCreateSkus(){
  if(!productForm.value.id){ ElMessage.warning('请先保存商品基础信息'); return }
  if(!newSkuMatrix.value.length){ ElMessage.info('没有待创建的SKU'); return }
  // 校验
  for(const row of newSkuMatrix.value){
    if(!row.size){ ElMessage.warning('存在未填写尺码的行'); return }
    if(!row.barcode){ ElMessage.warning(`尺码 ${row.size} 未填写条码`); return }
    if(!/^\d{1,32}$/.test(String(row.barcode)) && String(row.barcode).length<3){ ElMessage.warning(`条码格式不规范：${row.barcode}`); return }
    const qty = Number(row.stock||0); if(!Number.isInteger(qty) || qty<0){ ElMessage.warning(`尺码 ${row.size} 的数量需为非负整数`); return }
  }
  try{
    skuLoading.value = true
    // 服务端强制同价，这里仅传必要字段
    const payload: ProductSkuPayload[] = newSkuMatrix.value.map(r=>({ size: r.size, barcode: String(r.barcode), tag_price: Number(skuGenBase.value.tag_price||0), cost_price: Number(skuGenBase.value.cost_price||0), stock: Number(r.stock||0), sort: Number(r.sort||0), status: r.status||'active' }))
    await productExtApi.batchCreateSkus(productForm.value.id, payload)
    ElMessage.success('SKU创建成功')
    newSkuMatrix.value = []
    await loadSkus(productForm.value.id)
  } catch(e:any){ ElMessage.error(e?.message||'创建失败') } finally { skuLoading.value=false }
}

// 保存商品（改为真实接口：更新字段映射到后端）
const handleSave = async () => {
  if (!productFormRef.value) return

  await productFormRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      loading.value = true
      const payload: any = {
        name: productForm.value.name,
        category: productForm.value.category,
        retail_price: productForm.value.price,
        min_stock: productForm.value.minStock,
        status: productForm.value.status,
      }
      if (productForm.value.id) {
        await productsApi.updateProduct(productForm.value.id, payload)
        ElMessage.success('更新成功')
      } else {
        const ret = await productsApi.createProduct(payload)
        if (ret?.success) {
          const id = ret.data?.product?.id || ret.data?.id
          if (id) {
            productForm.value.id = String(id)
            ElMessage.success('创建成功')
            // 切换到 SKU 矩阵页签
            setTimeout(() => {
              const tab = document.querySelector('.product-edit-dialog .el-tabs__item:last-child') as HTMLElement
              tab?.click?.()
            }, 50)
          }
        } else {
          throw new Error(ret?.message || '创建失败')
        }
      }
      dialogVisible.value = true
      await getProducts()
    } catch (error: any) {
      ElMessage.error(error?.message || '保存失败')
    } finally {
      loading.value = false
    }
  })
}

// 分页改变
const handleSizeChange = (size: number) => {
  pageSize.value = size
  currentPage.value = 1
  getProducts()
}

const handleCurrentChange = (page: number) => {
  currentPage.value = page
  getProducts()
}

// 获取库存状态标签类型
const getStockTagType = (product: Product) => {
  if (product.stock === 0) return 'danger'
  if (product.stock <= product.minStock) return 'warning'
  return 'success'
}

// 获取库存状态文本
const getStockText = (product: Product) => {
  if (product.stock === 0) return '缺货'
  if (product.stock <= product.minStock) return '库存不足'
  return '正常'
}

// 服装属性仅保留尺码
const clothingMetaLoaded = ref(false)
const clothingSizes = ref<string[]>([])
// 移除颜色
// const clothingColors = ref<string[]>([])

async function loadClothingMeta(){
  if(clothingMetaLoaded.value) return
  try {
    const metaRes = await productsApi.getClothingMeta();
    if(metaRes.success){
      clothingSizes.value = metaRes.data?.sizes||[]
      // clothingColors.value = []
      clothingMetaLoaded.value = true
    }
  } catch(e){}
}

// 扩展：富文本/SEO
const contentLoading = ref(false)
const contentForm = ref<ProductContentPayload>({ rich_html:'', mobile_html:'', seo_title:'', seo_keywords:'', seo_desc:'' })
async function loadContent(pid: string|number){
  contentLoading.value = true
  try { const res = await productExtApi.getContent(pid); if(res.success){ contentForm.value = { ...(res.data||{}) } } } finally { contentLoading.value = false }
}
async function saveContent(){
  if(!productForm.value.id) return
  try { contentLoading.value = true; await productExtApi.saveContent(productForm.value.id, contentForm.value); ElMessage.success('内容已保存'); } catch(e:any){ ElMessage.error(e?.message||'保存失败'); } finally { contentLoading.value=false }
}

// 扩展：媒体
const mediaLoading = ref(false)
const mediaList = ref<any[]>([])
const mediaForm = ref<ProductMediaPayload>({ url:'', type:'image', thumb_url:'', sort:0, is_main:false })
// 兼容 SSR/预渲染：安全读取 token
const uploadHeaders = computed(() => {
  try {
    if (typeof localStorage !== 'undefined') {
      const tk = localStorage.getItem('token') || ''
      return tk ? { Authorization: `Bearer ${tk}` } : {}
    }
  } catch {}
  return {}
})
async function loadMedia(pid: string|number){
  mediaLoading.value=true
  try { const res = await productExtApi.listMedia(pid); if(res.success){ mediaList.value = res.data||[] } } finally { mediaLoading.value=false }
}
async function addMedia(){
  if(!productForm.value.id) return
  if(!mediaForm.value.url){ ElMessage.warning('请输入URL'); return }
  try { mediaLoading.value=true; await productExtApi.createMedia(productForm.value.id, mediaForm.value); ElMessage.success('添加成功'); mediaForm.value = { url:'', type:'image', thumb_url:'', sort:0, is_main:false }; await loadMedia(productForm.value.id) } catch(e:any){ ElMessage.error(e?.message||'添加失败') } finally { mediaLoading.value=false }
}
async function updateMedia(item:any, patch: Partial<ProductMediaPayload & {is_main:boolean}>){
  try { await productExtApi.updateMedia(item.id, patch); if(patch.is_main){ mediaList.value.forEach(m=>{ m.is_main = (m.id===item.id) }) } Object.assign(item, patch) } catch(e:any){ ElMessage.error(e?.message||'更新失败') }
}
async function removeMedia(item:any){
  await ElMessageBox.confirm('确定删除该媒体资源?','提示',{type:'warning'}).catch(()=>{throw new Error('cancel')})
  try { await productExtApi.deleteMedia(item.id); ElMessage.success('已删除'); mediaList.value = mediaList.value.filter(m=>m.id!==item.id) } catch(e:any){ if(e.message!=='cancel') ElMessage.error(e?.message||'删除失败') }
}

// 扩展：SKU 矩阵
const skuLoading = ref(false)
const skuList = ref<any[]>([])
const newSkuMatrix = ref<any[]>([])
const skuSelectedSizes = ref<string[]>([])
// 移除颜色选择
// const skuSelectedColors = ref<string[]>([])
// 移除 SKU 价格基准，只保留条码/成本等必要项
// const skuGenBase = ref({ retail_price: 0, tag_price: 0, cost_price: 0 })
const skuGenBase = ref({ tag_price: 0, cost_price: 0 })

async function loadSkus(pid: string|number){
  skuLoading.value = true
  try { const res = await productExtApi.listSkus(pid); if(res.success){ skuList.value = res.data||[] } } finally { skuLoading.value=false }
}

function generateSkuMatrix(){
  if(!skuSelectedSizes.value.length){ ElMessage.warning('请选择尺码'); return }
  const combos: any[] = []
  skuSelectedSizes.value.forEach(sz=>{
    const barcode = `${productForm.value.id}-${sz}`
    if(!skuList.value.find((s:any)=>s.size===sz) && !newSkuMatrix.value.find((s:any)=>s.size===sz)){
      combos.push({ size: sz, color: '', barcode, /* 统一价：不再生成 retail_price */ tag_price: skuGenBase.value.tag_price, cost_price: skuGenBase.value.cost_price, stock:0, sort:0, status:'active' })
    }
  })
  if(!combos.length){ ElMessage.info('无新增组合'); return }
  newSkuMatrix.value = newSkuMatrix.value.concat(combos)
}

async function updateSingleSku(row:any, field: string, value:any){
  // 若字段为 retail_price 则忽略更新，统一价模式不允许编辑 SKU 价
  if (field === 'retail_price') { return }
  try { await productExtApi.updateSku(row.id, { [field]: value }); row[field]=value } catch(e:any){ ElMessage.error(e?.message||'更新失败') }
}
async function toggleSkuStatus(row:any){
  const next = row.status==='active'?'disabled':'active'
  try { await productExtApi.updateSkuStatus(row.id, next); row.status=next } catch(e:any){ ElMessage.error(e?.message||'状态更新失败') }
}
const newSize = ref('')
function addCustomSize() {
  const sz = (newSize.value || '').trim()
  if (!sz) return
  if (sz.length > 20) { ElMessage.warning('尺码长度不能超过20字符'); return }
  if (!clothingSizes.value.includes(sz)) clothingSizes.value.push(sz)
  if (!skuSelectedSizes.value.includes(sz)) skuSelectedSizes.value.push(sz)
  newSize.value = ''
}

async function deleteSku(row: any) {
  try {
    if ((row.stock || 0) !== 0 || (row.locked_stock || 0) !== 0) {
      await ElMessageBox.alert('该SKU库存或占用不为0，无法删除。请先盘点为0或释放占用。', '无法删除', { type: 'warning' })
      return
    }
    await ElMessageBox.confirm(`确定删除尺码 ${row.size} 的SKU吗？该操作不可恢复。`, '删除SKU', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    await productExtApi.deleteSku(row.id)
    ElMessage.success('SKU已删除')
    skuList.value = skuList.value.filter((s: any) => s.id !== row.id)
  } catch (e: any) {
    if (e?.message !== 'cancel') ElMessage.error(e?.message || '删除失败')
  }
}

// WIP: label printing placeholder to avoid undefined error
function printLabels(row: Product) {
  ElMessage.info(`Label printing WIP: ${row.name}`)
}

// 辅助：提示文案
const tips = {
  skuIntro: '在这里按尺码生成SKU组合，并批量创建；已存在的SKU可修改条码、价格，或切换启用/停用。',
  sizeHelp: '勾选需要的尺码，点击“生成组合”后会出现在“待创建SKU”列表，点击“批量创建”后正式生效。',
  barcodeHelp: '条码可手动输入或使用扫码枪录入，需全局唯一。',
}

// 当编辑弹窗打开时加载扩展数据
watch(()=>dialogVisible.value, async (val)=>{
  if(val && productForm.value.id){ await Promise.all([loadClothingMeta(), loadContent(productForm.value.id), loadMedia(productForm.value.id), loadSkus(productForm.value.id)]) }
})

// 页面挂载时获取数据
onMounted(() => {
  getProducts()
})
</script>

<template>
  <div class="product-management">
    <!-- 搜索区域 -->
    <el-card class="search-card" shadow="never">
      <div class="search-form">
        <el-form :model="searchForm" inline>
          <el-form-item label="关键字">
            <el-input
              v-model="searchForm.keyword"
              placeholder="商品名称"
              style="width: 200px"
              clearable
              @keyup.enter="handleSearch"
            />
          </el-form-item>
          <el-form-item label="分类">
            <el-select
              v-model="searchForm.category"
              placeholder="请选择分类"
              style="width: 150px"
              clearable
            >
              <el-option
                v-for="category in categories"
                :key="category"
                :label="category"
                :value="category"
              />
            </el-select>
          </el-form-item>
          <!-- 移除状态筛选 -->
          <el-form-item>
            <el-button type="primary" @click="handleSearch">
              <FaIcon name="i-ep:search" /> 搜索
            </el-button>
            <el-button @click="handleReset">
              <FaIcon name="i-ep:refresh" /> 重置
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-card>

    <!-- 表格区域 -->
    <el-card class="table-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">
            <FaIcon name="i-ep:goods" /> 商品列表
          </span>
          <el-button type="primary" @click="handleAdd">
            <FaIcon name="i-ep:plus" /> 添加商品
          </el-button>
        </div>
      </template>

      <el-table
        v-loading="loading"
        :data="products"
        border
        stripe
        style="width: 100%"
        empty-text="暂无数据"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="商品名称" min-width="150" />
        <el-table-column prop="category" label="分类" width="120">
          <template #default="{ row }">
            <el-tag type="info">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="price" label="价格" width="100">
          <template #default="{ row }">
            <span class="price">¥{{ row.price.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="stock" label="总库存(按尺码汇总)" width="160">
          <template #default="{ row }">
            <el-tag :type="getStockTagType(row)">{{ row.stock }}</el-tag>
          </template>
        </el-table-column>

        <!-- 新增：尺码库存（横向紧凑展示） -->
        <el-table-column label="尺码库存" min-width="260">
          <template #default="{ row }">
            <div class="size-inline" @mouseenter="ensureSkusLoaded(row.id)">
              <template v-if="skuMap[row.id] && (skuMap[row.id].list || []).length">
                <span
                  v-for="s in skuMap[row.id].list"
                  :key="s.id"
                  class="size-chip"
                  :class="{ danger: s.stock === 0, warn: s.stock > 0 && s.stock <= 3 }"
                  :title="`${s.size} 库存：${s.stock}`"
                >
                  {{ s.size }}: {{ s.stock }}
                </span>
              </template>
              <el-skeleton v-else-if="skuMap[row.id]?.loading" :rows="1" animated style="width: 160px" />
              <span v-else class="text-muted">—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="minStock" label="最低库存" width="100" />
        <!-- 已移除供应商列 -->
        <!-- 移除状态列 -->
        <el-table-column prop="updateTime" label="更新时间" width="120" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              @click="handleEdit(row)"
            >
              <FaIcon name="i-ep:edit" /> 编辑
            </el-button>
            <el-button
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
              <FaIcon name="i-ep:delete" /> 下架
            </el-button>
            <el-button size="small" @click="printLabels(row)">吊牌打印</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 商品编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="900px"
      class="product-edit-dialog"
      top="5vh"
      :close-on-click-modal="false"
    >
      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="基础信息" name="base">
          <el-form
            ref="productFormRef"
            :model="productForm"
            :rules="productFormRules"
            label-width="100px"
            @submit.prevent
          >
            <el-row :gutter="20">
              <el-col :span="24">
                <el-form-item label="商品名称" prop="name">
                  <el-input
                    v-model="productForm.name"
                    placeholder="请输入商品名称"
                    maxlength="50"
                    show-word-limit
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="分类" prop="category">
                  <el-select
                    v-model="productForm.category"
                    placeholder="请选择分类"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="category in categories"
                      :key="category"
                      :label="category"
                      :value="category"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="价格" prop="price">
                  <el-input-number
                    v-model="productForm.price"
                    :min="0.01"
                    :precision="2"
                    :step="0.01"
                    placeholder="商品价格"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="最低库存" prop="minStock">
                  <el-input-number
                    v-model="productForm.minStock"
                    :min="0"
                    placeholder="最低库存"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <!-- 已移除供应商输入项 -->
            </el-row>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="富文本&SEO" name="content">
          <el-form label-width="100px" class="mt-2">
            <el-form-item label="PC详情">
              <el-input type="textarea" :rows="6" v-model="contentForm.rich_html" placeholder="支持HTML，后续接入富文本编辑器" />
            </el-form-item>
            <el-form-item label="移动详情">
              <el-input type="textarea" :rows="4" v-model="contentForm.mobile_html" placeholder="移动端HTML" />
            </el-form-item>
            <el-form-item label="SEO标题">
              <el-input v-model="contentForm.seo_title" maxlength="150" show-word-limit />
            </el-form-item>
            <el-form-item label="SEO关键词">
              <el-input v-model="contentForm.seo_keywords" maxlength="255" show-word-limit />
            </el-form-item>
            <el-form-item label="SEO描述">
              <el-input type="textarea" :rows="3" v-model="contentForm.seo_desc" maxlength="500" show-word-limit />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="contentLoading" @click="saveContent">保存内容</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="媒体" name="media">
          <div class="media-form">
            <el-form inline label-width="80px">
              <el-form-item label="URL">
                <el-input v-model="mediaForm.url" placeholder="图片/视频URL" style="width:320px" />
              </el-form-item>
              <el-form-item label="缩略图">
                <el-input v-model="mediaForm.thumb_url" placeholder="缩略图URL" style="width:220px" />
              </el-form-item>
              <el-form-item>
                <el-select v-model="mediaForm.type" style="width:100px">
                  <el-option label="图片" value="image" />
                  <el-option label="视频" value="video" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="mediaLoading" @click="addMedia">添加</el-button>
              </el-form-item>
              <el-form-item label="本地上传">
                <el-upload
                  v-if="productForm.id"
                  :action="`/api/products/${productForm.id}/media/upload`"
                  name="file"
                  :headers="uploadHeaders"
                  :show-file-list="false"
                  accept="image/*"
                  :on-success="onUploadSuccess"
                  :on-error="onUploadError"
                >
                  <el-button>选择文件</el-button>
                </el-upload>
              </el-form-item>
            </el-form>
            <el-table :data="mediaList" size="small" style="width:100%;margin-top:10px" v-loading="mediaLoading">
              <el-table-column label="预览" width="100">
                <template #default="{row}">
                  <img v-if="row.type==='image'" :src="row.thumb_url||row.url" style="width:60px;height:60px;object-fit:cover" />
                  <span v-else>视频</span>
                </template>
              </el-table-column>
              <el-table-column prop="url" label="URL" min-width="200" />
              <el-table-column prop="sort" label="排序" width="80">
                <template #default="{row}"><el-input-number v-model="row.sort" size="small" @change="(v:number)=>updateMedia(row,{sort:v})" :min="0" /></template>
              </el-table-column>
              <el-table-column prop="is_main" label="主图" width="70">
                <template #default="{row}"><el-switch v-model="row.is_main" @change="(v:boolean)=>updateMedia(row,{is_main:v})" /></template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{row}">
                  <el-button link type="danger" size="small" @click="removeMedia(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
        <el-tab-pane label="SKU矩阵" name="skus">
          <div class="sku-section">
            <el-alert :title="tips.skuIntro" type="info" show-icon :closable="false" class="mb-2" />

            <!-- 新增：尺码阈值/目标配置（每码最低库存/自动补货目标） -->
            <el-card class="mb-2" shadow="never">
              <template #header>
                <div style="display:flex;align-items:center;gap:12px">
                  <b>尺码阈值/目标配置</b>
                  <FaIcon name="i-ep:info-filled" />
                </div>
              </template>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span>默认阈值</span>
                <el-input-number v-model="minThreshold" :min="0" :max="9999" />
                <span>默认目标</span>
                <el-input-number v-model="planTarget" :min="0" :max="99999" />
                <el-button size="small" @click="applyReorderToAll">应用到全部尺码</el-button>
                <el-button size="small" type="primary" @click="saveReorderConfig">保存阈值/目标</el-button>
                <span style="color:#909399">提示：当某尺码库存低于阈值时，系统会按目标自动生成工厂订单。</span>
              </div>
            </el-card>

            <div class="sku-meta-select">
              <el-form inline>
                <el-form-item label="尺码">
                  <el-checkbox-group v-model="skuSelectedSizes">
                    <el-checkbox v-for="s in clothingSizes" :key="s" :label="s" />
                  </el-checkbox-group>
                </el-form-item>
                <el-form-item label="自定义">
                  <el-input v-model="newSize" size="small" placeholder="输入新尺码，如 2XL/165/均码" style="width: 220px" />
                </el-form-item>
                <el-form-item>
                  <el-button size="small" @click="addCustomSize">添加尺码</el-button>
                </el-form-item>
                <el-form-item>
                  <el-text class="help-text">{{ tips.sizeHelp }}</el-text>
                </el-form-item>
                <!-- 移除默认价格输入 -->
                <!--
                <el-form-item label="默认价格">
                  <el-input-number v-model="skuGenBase.retail_price" :min="0" :step="0.01" :precision="2" placeholder="零售价" />
                </el-form-item>
                -->
                <el-form-item>
                  <el-button type="primary" @click="generateSkuMatrix">生成组合</el-button>
                </el-form-item>
              </el-form>
            </div>

            <el-divider content-position="left">待创建SKU ({{ newSkuMatrix.length }})</el-divider>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-muted">数量快捷：</span>
              <el-input-number v-model="bulkQty" :min="0" :step="1" size="small" placeholder="同填数量" />
              <el-button size="small" @click="fillAllQty">同填</el-button>
              <el-button size="small" @click="clearAllQty">清零</el-button>
            </div>
            <div class="table-scroll">
              <el-table :data="newSkuMatrix" size="small" style="width:100%">
                <el-table-column prop="size" label="尺码" width="80" />
                <el-table-column prop="barcode" label="条码" min-width="200">
                  <template #default="{row}">
                    <el-tooltip :content="tips.barcodeHelp" placement="top">
                      <el-input v-model="row.barcode" size="small" placeholder="可扫码枪输入" />
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column prop="stock" label="初始数量" width="110">
                  <template #default="{row,$index}"><el-input-number v-model="row.stock" :min="0" :step="1" size="small" @change="()=>copyPrevQty($index)" /></template>
                </el-table-column>
                <el-table-column label="排序" width="90">
                  <template #default="{row}"><el-input-number v-model="row.sort" :min="0" size="small" /></template>
                </el-table-column>
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{row,$index}">
                    <el-button link type="danger" size="small" @click="newSkuMatrix.splice($index,1)">移除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <div class="mt-2">
              <el-button type="primary" size="small" :loading="skuLoading" @click="batchCreateSkus">批量创建</el-button>
              <el-button size="small" @click="newSkuMatrix=[]">清空</el-button>
            </div>

            <el-divider content-position="left">已存在SKU ({{ skuList.length }})</el-divider>
            <div class="table-scroll">
              <el-table :data="skuList" size="small" style="width:100%" v-loading="skuLoading">
                <el-table-column prop="size" label="尺码" width="80" />
                <el-table-column prop="barcode" label="条码" min-width="200">
                  <template #default="{row}">
                    <el-tooltip :content="tips.barcodeHelp" placement="top">
                      <el-input v-model="row.barcode" size="small" placeholder="可扫码枪输入" @blur="(e:any)=>updateSingleSku(row,'barcode',row.barcode)" />
                    </el-tooltip>
                  </template>
                </el-table-column>
                <!-- 移除零售价列的编辑 -->
                <!--
                <el-table-column prop="retail_price" label="零售价" width="120">
                  <template #default="{row}"><el-input-number v-model="row.retail_price" :min="0" :step="0.01" :precision="2" size="small" @change="(v:number)=>updateSingleSku(row,'retail_price',v)" /></template>
                </el-table-column>
                -->
                <el-table-column prop="stock" label="库存" width="90" />
                <el-table-column prop="status" label="状态" width="100">
                  <template #default="{ row }">
                    <el-tag :type="row.status==='active'?'success':'info'" @click="toggleSkuStatus(row)" style="cursor:pointer">{{ row.status==='active'?'启用':'停用' }}</el-tag>
                  </template>
                </el-table-column>
                <!-- 新增：每码最低库存 / 自动补货目标列 -->
                <el-table-column prop="reorder_threshold" label="最低库存(阈值)" width="140">
                  <template #default="{row}"><el-input-number v-model.number="row.reorder_threshold" :min="0" :max="9999" size="small" /></template>
                </el-table-column>
                <el-table-column prop="reorder_target" label="自动进货目标" width="140">
                  <template #default="{row}"><el-input-number v-model.number="row.reorder_target" :min="0" :max="99999" size="small" /></template>
                </el-table-column>
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button link type="danger" size="small" @click="deleteSku(row)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogVisible = false">关闭</el-button>
          <el-button type="primary" :loading="loading" @click="handleSave">保存基础信息</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.product-management {
  padding: 16px;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  .search-form {
    .el-form {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
  }
}

.table-card {
  border-radius: 8px;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: #303133;
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }
}

.price {
  color: #e6a23c;
  font-weight: 600;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.dialog-footer {
  text-align: right;
}

/* 新增：尺码库存横向紧凑样式，与库存页保持一致风格 */
.size-inline { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
.size-chip { padding: 2px 8px; border-radius: 999px; background: #f5f7fa; color: #606266; font-weight: 600; font-size: 12px; line-height: 18px; }
.size-chip.warn { background: #fff7e6; color: #ad6800; }
.size-chip.danger { background: #fff1f0; color: #a8071a; }
.text-muted { color: #bbb; }

/* 新增：滚动与布局优化，避免按钮被遮挡 */
.product-edit-dialog :deep(.el-tabs__content){ max-height: 60vh; overflow: auto; }
.table-scroll { width: 100%; overflow-x: auto; }
.sku-section { padding-bottom: 8px; }
.sku-section .sku-meta-select { position: sticky; top: 0; background: #fff; z-index: 1; padding: 6px 0 8px; border-bottom: 1px solid #f0f0f0; }
.help-text { color:#909399; font-size:12px; }
.mb-2 { margin-bottom: 8px; }
.mt-2 { margin-top: 8px; }

// 响应式设计
@media (max-width: 768px) {
  .product-management { padding: 10px; }
  .search-form { .el-form { .el-form-item { margin-bottom: 10px; } } }
  .card-header { flex-direction: column; gap: 10px; align-items: flex-start !important; }
  .el-table { font-size: 12px; }
}
</style>
