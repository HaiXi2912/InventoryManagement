<route lang="yaml">
meta:
  title: 销售管理
  icon: ep:sell
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
// 新增：接入真实后端 API
import SalesAPI from '@/api/modules/sales'
import ProductsAPI from '@/api/modules/products'
// 新增：SKU API
import ProductExtAPI from '@/api/modules/productExt'

// 销售单数据接口
interface SaleItem {
  id: string
  productId: string
  productName: string
  // 新增：SKU 维度
  skuId?: string
  size?: string
  barcode?: string
  quantity: number
  price: number
  subtotal: number
}

interface Sale {
  id: string
  orderNo: string
  customerName: string
  customerPhone: string
  customerAddress: string
  totalAmount: number
  status: 'pending' | 'confirmed' | 'shipped' | 'completed' | 'cancelled'
  paymentStatus: 'unpaid' | 'paid' | 'refunded'
  createTime: string
  updateTime: string
  items: SaleItem[]
  remark?: string
}

// 表单模型（扩展销售类型）
interface SaleFormModel extends Partial<Sale> {
  saleType?: 'retail' | 'wholesale' | 'online'
}

// 商品选择接口
interface Product {
  id: string
  name: string
  category: string
  price: number
  wholesale_price?: number
  stock: number
}

// 新增：SKU 接口
interface ProductSkuItem {
  id: string
  product_id: string | number
  size: string
  color?: string
  barcode?: string
  retail_price?: number
  stock?: number
  status?: 'active'|'disabled'
}

// 响应式数据
const loading = ref(false)
const searchForm = ref({
  keyword: '',
  status: '',
  paymentStatus: '',
  startDate: '',
  endDate: '',
  // 新增：销售类型筛选
  saleType: '' as '' | 'retail' | 'wholesale' | 'online'
})

const sales = ref<Sale[]>([])
const total = ref(0)
const pageSize = ref(10)
const currentPage = ref(1)

// 对话框相关
const dialogVisible = ref(false)
const dialogTitle = ref('添加销售单')
const editingId = ref('')

// 销售单表单
const saleForm = ref<SaleFormModel>({
  orderNo: '',
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  status: 'pending',
  paymentStatus: 'unpaid',
  items: [],
  remark: '',
  // 新增：默认批发
  saleType: 'wholesale'
})

// 商品选择相关
const productDialogVisible = ref(false)
const products = ref<Product[]>([])
const selectedProduct = ref<Product | null>(null)
const productQuantity = ref(1)
// 新增：SKU 选择相关
const productSkus = ref<ProductSkuItem[]>([])
const productSkusCache = ref<Record<string, ProductSkuItem[]>>({})
const selectedSkuId = ref<string | null>(null)
const selectedSku = computed(() => productSkus.value.find(s => String(s.id) === String(selectedSkuId.value)))
const skuPrice = ref<number | null>(null)
const barcodeInput = ref('')
// 新增：批量模式
const bulkMode = ref(false)
const bulkQtyMap = ref<Record<string, number>>({})

// 新增：快速新增商品所需状态
const quickCreateVisible = ref(false)
const clothingCategories = ref<string[]>([])
const quickForm = ref({
  name: '',
  category: '',
  wholesale_price: 0,
  retail_price: 0,
  genSkus: true,
  skuTemplate: 'apparel' as 'apparel'|'one',
  baseBarcode: '',
  initStock: 0,
})

const loadClothingMeta = async () => {
  try {
    const res = await ProductsAPI.getClothingMeta()
    const cats = (res?.data?.categories || []) as string[]
    clothingCategories.value = cats
  } catch {
    clothingCategories.value = []
  }
}

const resetQuickForm = () => {
  quickForm.value = {
    name: '', category: clothingCategories.value[0] || '', wholesale_price: 0, retail_price: 0,
    genSkus: true, skuTemplate: 'apparel', baseBarcode: '', initStock: 0
  }
}

const createProductQuick = async () => {
  if (!quickForm.value.name.trim()) { ElMessage.warning('请输入商品名称'); return }
  if (quickForm.value.wholesale_price && quickForm.value.retail_price && Number(quickForm.value.wholesale_price) > Number(quickForm.value.retail_price)) {
    ElMessage.warning('批发价不可高于零售价'); return
  }
  try {
    const payload: any = {
      name: quickForm.value.name.trim(),
      category: quickForm.value.category || null,
      wholesale_price: Number(quickForm.value.wholesale_price || 0),
      retail_price: Number(quickForm.value.retail_price || 0),
      status: 'active'
    }
    const res = await ProductsAPI.createProduct(payload)
    const prod = (res?.data?.product) || (res?.data) || res
    const newId = String(prod?.id || prod?.data?.id || '')
    if (!newId) { ElMessage.error('创建商品失败'); return }

    // 可选：一键生成SKU
    if (quickForm.value.genSkus) {
      try {
        await ProductExtAPI.batchCreateSkusBySize(newId, {
          template: quickForm.value.skuTemplate,
          baseBarcode: quickForm.value.baseBarcode || undefined,
          retail_price: Number(quickForm.value.retail_price || 0),
          stock: Number(quickForm.value.initStock || 0),
        } as any)
      } catch (e) {
        console.warn('批量创建SKU失败', e)
      }
    }

    // 刷新商品并选中
    await loadProducts()
    await loadProductSkus(newId)
    selectedProduct.value = products.value.find(p => String(p.id) === newId) || null
    quickCreateVisible.value = false
    ElMessage.success('商品已创建')
  } catch (e) {
    ElMessage.error('创建商品失败')
  }
}

// 新增：无SKU快速加入
const addNoSkuToSale = () => {
  if (!selectedProduct.value) { ElMessage.warning('请先选择商品'); return }
  const qty = Number(productQuantity.value || 0)
  if (qty <= 0) { ElMessage.warning('数量需大于0'); return }
  const price = Number((skuPrice.value ?? getDefaultUnitPrice(selectedProduct.value)) || 0)
  // 合并同商品的无SKU行（skuId 为空）
  const exist = saleForm.value.items?.find(it => it.productId === selectedProduct.value!.id && !it.skuId)
  if (exist) {
    exist.quantity += qty
    exist.subtotal = exist.quantity * exist.price
  } else {
    const newItem: SaleItem = {
      id: `${Date.now()}-nosku`,
      productId: selectedProduct.value.id,
      productName: selectedProduct.value.name,
      quantity: qty,
      price: price,
      subtotal: qty * price
    }
    if (!saleForm.value.items) saleForm.value.items = []
    saleForm.value.items.push(newItem)
  }
}

// 表单验证
const formRef = ref<FormInstance>()
const rules: FormRules = {
  customerName: [
    { required: true, message: '请输入客户姓名', trigger: 'blur' }
  ],
  customerPhone: [
    { required: true, message: '请输入客户电话', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ],
  customerAddress: [
    { required: true, message: '请输入客户地址', trigger: 'blur' }
  ]
}

// 计算属性
const totalAmount = computed(() => {
  return saleForm.value.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0
})

const statusMap = {
  pending: { text: '待确认', type: 'warning' },
  confirmed: { text: '已确认', type: 'primary' },
  shipped: { text: '已发货', type: 'info' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'danger' }
} as const

type StatusKey = keyof typeof statusMap

const paymentStatusMap = {
  unpaid: { text: '未付款', type: 'warning' },
  paid: { text: '已付款', type: 'success' },
  refunded: { text: '已退款', type: 'info' }
} as const

type PayStatusKey = keyof typeof paymentStatusMap

// 工具
function fmtDateInput(d: any): string | undefined {
  if (!d) return undefined
  try {
    const dt = typeof d === 'string' ? new Date(d) : d
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const day = String(dt.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch { return undefined }
}

// 根据销售类型返回该商品默认单价
function getDefaultUnitPrice(prod?: Product | null): number {
  if (!prod) return 0
  if (saleForm.value.saleType === 'wholesale') {
    return Number(prod.wholesale_price ?? prod.price ?? 0)
  }
  return Number(prod.price ?? 0)
}

// 方法
const loadSales = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      size: pageSize.value,
      status: searchForm.value.status || undefined,
      payment_status: searchForm.value.paymentStatus || undefined,
      sale_no: searchForm.value.keyword || undefined,
      start_date: fmtDateInput(searchForm.value.startDate),
      end_date: fmtDateInput(searchForm.value.endDate),
      // 新增：传销售类型
      sale_type: searchForm.value.saleType || undefined,
    }
    const res = await SalesAPI.getSaleList(params as any)
    const list = (res?.data?.sales || []) as any[]
    sales.value = list.map((s: any) => ({
      id: String(s.id),
      orderNo: s.sale_no,
      customerName: s.customer?.name || '',
      customerPhone: s.customer?.phone || '',
      customerAddress: s.customer?.address || '',
      totalAmount: Number(s.total_amount || 0),
      status: s.status,
      paymentStatus: s.payment_status,
      createTime: s.createdAt ? new Date(s.createdAt).toLocaleString() : '',
      updateTime: s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '',
      items: [],
      remark: s.remark || ''
    }))
    const p = res?.data?.pagination || {}
    total.value = p.total || p.total_count || 0
  } catch (error) {
    ElMessage.error('加载销售单失败')
  } finally {
    loading.value = false
  }
}

const loadProducts = async () => {
  try {
    const res = await ProductsAPI.getProductList({ page: 1, limit: 100 })
    const list = (res?.data?.products || []) as any[]
    products.value = list.map((p: any) => ({
      id: String(p.id),
      name: p.name,
      category: p.category || '-',
      price: Number(p.retail_price || 0),
      wholesale_price: Number(p.wholesale_price ?? p.retail_price ?? 0),
      stock: Number(p.sku_stock_sum ?? p.inventory?.available_stock ?? p.inventory?.current_stock ?? 0)
    }))
  } catch (error) {
    ElMessage.error('加载商品列表失败')
  }
}

// 新增：加载商品的 SKU 列表
const loadProductSkus = async (productId: string) => {
  try {
    // 缓存命中
    if (productSkusCache.value[productId]) {
      productSkus.value = productSkusCache.value[productId]
      return
    }
    const res = await ProductExtAPI.listSkus(productId)
    const list = (res?.data || []) as any[]
    const mapped: ProductSkuItem[] = list.map((s: any) => ({
      id: String(s.id),
      product_id: s.product_id,
      size: s.size,
      color: s.color,
      barcode: s.barcode,
      retail_price: Number(s.retail_price ?? 0),
      stock: Number(s.stock ?? 0),
      status: s.status
    }))
    productSkus.value = mapped
    productSkusCache.value[productId] = mapped
  } catch (e) {
    ElMessage.error('加载SKU失败')
  }
}

const handleSearch = () => {
  currentPage.value = 1
  loadSales()
}

const handleReset = () => {
  searchForm.value = {
    keyword: '',
    status: '',
    paymentStatus: '',
    startDate: '',
    endDate: '',
    saleType: ''
  }
  handleSearch()
}

const handleAdd = () => {
  dialogTitle.value = '添加销售单'
  editingId.value = ''
  saleForm.value = {
    orderNo: generateOrderNo(),
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    status: 'pending',
    paymentStatus: 'unpaid',
    items: [],
    remark: '',
    saleType: 'wholesale'
  }
  dialogVisible.value = true
}

const handleEdit = (_row: Sale) => {
  // 仅支持新建销售单，暂不支持编辑已存在销售单
  ElMessage.info('暂不支持编辑已存在销售单')
}

const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要取消这个销售单吗？', '确认取消', {
      type: 'warning'
    })
    await SalesAPI.cancelSale(id)
    ElMessage.success('已取消')
    loadSales()
  } catch (error) {
    // 用户取消或接口报错
  }
}

const handleStatusChange = async (id: string, newStatus: Sale['status']) => {
  try {
    await ElMessageBox.confirm(`确定要将状态更改为"${statusMap[newStatus as StatusKey].text}"吗？`, '确认操作', {
      type: 'warning'
    })

    if (newStatus === 'confirmed') await SalesAPI.confirmSale(id)
    else if (newStatus === 'shipped') await SalesAPI.shipSale(id)
    else if (newStatus === 'completed') await SalesAPI.completeSale(id)
    else if (newStatus === 'cancelled') await SalesAPI.cancelSale(id)

    ElMessage.success('状态更新成功')
    loadSales()
  } catch (error) {
    // 用户取消或失败
  }
}

const generateOrderNo = () => {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.getTime().toString().slice(-6)
  return `SO${date}${time}`
}

const openProductDialog = () => {
  loadProducts()
  loadClothingMeta()
  selectedProduct.value = null
  productSkus.value = []
  productQuantity.value = 1
  selectedSkuId.value = null
  skuPrice.value = null
  barcodeInput.value = ''
  bulkMode.value = false
  bulkQtyMap.value = {}
  quickCreateVisible.value = false
  resetQuickForm()
  productDialogVisible.value = true
}

const handleProductSelect = async (product: Product) => {
  selectedProduct.value = product
  productQuantity.value = 1
  selectedSkuId.value = null
  skuPrice.value = null
  barcodeInput.value = ''
  bulkMode.value = false
  bulkQtyMap.value = {}
  await loadProductSkus(product.id)
  if ((productSkus.value || []).length === 0) {
    skuPrice.value = getDefaultUnitPrice(selectedProduct.value)
  }
}

// 选择 SKU
type MaybeSku = ProductSkuItem | undefined
const selectSku = (sku: MaybeSku) => {
  if (!sku) return
  selectedSkuId.value = String(sku.id)
  // 调整：根据销售类型返回默认价格
  skuPrice.value = getDefaultUnitPrice(selectedProduct.value)
}

// 条码回车选中 SKU（在当前商品的 SKU 列表内查找）
const handleScanEnter = () => {
  if (!barcodeInput.value) return
  const sku = productSkus.value.find(s => s.barcode && s.barcode === barcodeInput.value)
  if (!sku) {
    ElMessage.warning('条码未匹配到当前商品的SKU')
    return
  }
  selectSku(sku)
}

const addSkuToSale = () => {
  if (!selectedProduct.value) {
    ElMessage.warning('请先选择商品')
    return
  }
  const sku = selectedSku.value
  // 允许无SKU商品直接加入
  if (!sku) {
    if ((productSkus.value || []).length === 0) {
      addNoSkuToSale()
    } else {
      ElMessage.warning('请选择尺码')
    }
    return
  }
  if (productQuantity.value <= 0) {
    ElMessage.warning('数量需大于0')
    return
  }
  if ((sku.stock ?? 0) < productQuantity.value) {
    ElMessage.warning(`库存不足（可用 ${sku.stock ?? 0}）`)
    return
  }

  // 合并同商品同SKU
  const existingItem = saleForm.value.items?.find(item => item.productId === selectedProduct.value!.id && item.skuId === String(sku.id))
  if (existingItem) {
    existingItem.quantity += productQuantity.value
    existingItem.subtotal = existingItem.quantity * existingItem.price
  } else {
    const defaultPrice = Number((skuPrice.value ?? getDefaultUnitPrice(selectedProduct.value)) || 0)
    const newItem: SaleItem = {
      id: Date.now().toString(),
      productId: selectedProduct.value.id,
      productName: selectedProduct.value.name,
      skuId: String(sku.id),
      size: sku.size,
      barcode: sku.barcode,
      quantity: productQuantity.value,
      price: defaultPrice,
      subtotal: productQuantity.value * defaultPrice
    }
    if (!saleForm.value.items) saleForm.value.items = []
    saleForm.value.items.push(newItem)
  }

  // 缓存 SKU 列表，供明细里改尺码
  if (!productSkusCache.value[selectedProduct.value.id]) {
    productSkusCache.value[selectedProduct.value.id] = productSkus.value
  }

  // 重置当前选择
  selectedSkuId.value = null
  skuPrice.value = null
  productQuantity.value = 1
  barcodeInput.value = ''
}

// 批量加入明细
const addBulkToSale = () => {
  if (!selectedProduct.value) {
    ElMessage.warning('请先选择商品')
    return
  }
  const entries = Object.entries(bulkQtyMap.value || {})
    .map(([skuId, qty]) => ({ skuId, qty: Number(qty || 0) }))
    .filter(e => e.qty > 0)
  if (!entries.length) {
    ElMessage.warning('请为至少一个尺码填写数量')
    return
  }

  const defaultPrice = getDefaultUnitPrice(selectedProduct.value)

  for (const e of entries) {
    const sku = productSkus.value.find(s => String(s.id) === String(e.skuId))
    if (!sku) continue
    if ((sku.stock ?? 0) < e.qty) {
      ElMessage.warning(`尺码 ${sku.size} 库存不足（可用 ${sku.stock ?? 0}）`)
      continue
    }
    const exist = saleForm.value.items?.find(it => it.productId === selectedProduct.value!.id && it.skuId === String(e.skuId))
    if (exist) {
      exist.quantity += e.qty
      exist.subtotal = exist.quantity * exist.price
    } else {
      const price = Number(defaultPrice || 0)
      const newItem: SaleItem = {
        id: `${Date.now()}-${e.skuId}`,
        productId: selectedProduct.value.id,
        productName: selectedProduct.value.name,
        skuId: String(e.skuId),
        size: sku.size,
        barcode: sku.barcode,
        quantity: e.qty,
        price,
        subtotal: e.qty * price
      }
      if (!saleForm.value.items) saleForm.value.items = []
      saleForm.value.items.push(newItem)
    }
  }

  // 重置
  bulkQtyMap.value = {}
}

const removeItem = (index: number) => {
  saleForm.value.items?.splice(index, 1)
}

// 明细表内编辑 —— 修改数量/价格/尺码
const onEditQty = (row: SaleItem) => {
  if (row.quantity < 0) row.quantity = 0
  row.subtotal = row.quantity * row.price
}
const onEditPrice = (row: SaleItem) => {
  if (row.price < 0) row.price = 0
  row.subtotal = row.quantity * row.price
}
const onEditSize = async (row: SaleItem, newSkuId: string) => {
  // 从缓存中找
  const list = productSkusCache.value[row.productId]
  if (!list) {
    // 如果没有缓存，临时加载一次
    await loadProductSkus(row.productId)
  }
  const all = productSkusCache.value[row.productId] || productSkus.value
  const sku = all.find(s => String(s.id) === String(newSkuId))
  if (!sku) return
  row.skuId = String(sku.id)
  row.size = sku.size
  row.barcode = sku.barcode
  // 若价格未手动改过，统一使用商品价（按销售类型）
  if (!row.price || row.price === 0) {
    const prod = products.value.find(p => String(p.id) === String(row.productId))
    row.price = Number(getDefaultUnitPrice(prod))
  }
  row.subtotal = row.quantity * row.price
}

const handleSave = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()

    if (!saleForm.value.items || saleForm.value.items.length === 0) {
      ElMessage.warning('请至少添加一个商品')
      return
    }

    // 校验：所有行必须选择尺码，数量>0
    for (const it of saleForm.value.items) {
      if (!it.skuId) {
        ElMessage.warning(`商品【${it.productName}】未选择尺码`)
        return
      }
      if (it.quantity <= 0) {
        ElMessage.warning('数量需大于0')
        return
      }
    }

    // 依据“所有尺码同价”，将 SKU 明细聚合为：
    // 1) size_plans: { [product_id]: [{ size, qty, sku_id, unit_price }] }
    // 2) details: 按商品一行（quantity 由后端按 size_plans 聚合计算，这里传总和以便前端展示一致）
    const sizePlans: Record<string, Array<{ size: string; qty: number; sku_id?: number; unit_price?: number }>> = {}
    const detailMap: Record<string, { product_id: number; unit_price: number; quantity: number }> = {}

    for (const it of saleForm.value.items) {
      const pid = String(it.productId)
      const unitPrice = Number(it.price || 0)
      const qty = Number(it.quantity || 0)
      const skuIdNum = Number(it.skuId)
      // 仅当有尺码/SKU时写入 size_plans
      if (it.skuId || (it.size && String(it.size).trim().length > 0)) {
        if (!sizePlans[pid]) sizePlans[pid] = []
        sizePlans[pid].push({ size: String(it.size || ''), qty, sku_id: Number.isFinite(skuIdNum) ? skuIdNum : undefined, unit_price: unitPrice })
      }
      if (!detailMap[pid]) {
        // 取该商品的统一价格（按销售类型），若用户修改过，取第一行的 price
        const prod = products.value.find(p => String(p.id) === pid)
        const unifiedPrice = Number(getDefaultUnitPrice(prod) ?? unitPrice ?? 0)
        detailMap[pid] = { product_id: Number(pid), unit_price: unifiedPrice, quantity: qty }
      } else {
        detailMap[pid].quantity += qty
      }
    }

    const detailsPayload = Object.values(detailMap).map(d => ({ product_id: d.product_id, unit_price: d.unit_price, quantity: d.quantity }))

    saleForm.value.totalAmount = totalAmount.value

    if (editingId.value) {
      // 编辑：走更新接口，保持一致结构
      await SalesAPI.updateSale(editingId.value, {
        customer_id: undefined,
        sale_date: new Date().toISOString(),
        sale_type: saleForm.value.saleType || 'wholesale',
        discount_amount: 0,
        remark: saleForm.value.remark || '',
        details: detailsPayload,
        size_plans: sizePlans,
      } as any)
      ElMessage.success('更新成功')
    } else {
      // 新增
      await SalesAPI.createSale({
        customer_id: undefined,
        sale_date: new Date().toISOString(),
        sale_type: saleForm.value.saleType || 'wholesale',
        discount_amount: 0,
        remark: saleForm.value.remark || '',
        details: detailsPayload,
        size_plans: sizePlans,
      } as any)
      ElMessage.success('添加成功')
    }

    dialogVisible.value = false
    loadSales()
  } catch (error) {
    // 表单验证失败或接口失败
  }
}

const handleCancel = () => {
  dialogVisible.value = false
}

// 生命周期
onMounted(() => {
  loadSales()
})
</script>

<template>
  <div class="sales-management">
    <!-- 搜索区域 -->
    <div class="search-section">
      <el-card>
        <el-form :model="searchForm" inline>
          <el-form-item label="关键词">
            <el-input
              v-model="searchForm.keyword"
              placeholder="订单号/客户姓名/电话"
              clearable
              style="width: 200px"
            />
          </el-form-item>
          <el-form-item label="订单状态">
            <el-select v-model="searchForm.status" placeholder="请选择" clearable style="width: 120px">
              <el-option label="待确认" value="pending" />
              <el-option label="已确认" value="confirmed" />
              <el-option label="已发货" value="shipped" />
              <el-option label="已完成" value="completed" />
              <el-option label="已取消" value="cancelled" />
            </el-select>
          </el-form-item>
          <el-form-item label="付款状态">
            <el-select v-model="searchForm.paymentStatus" placeholder="请选择" clearable style="width: 120px">
              <el-option label="未付款" value="unpaid" />
              <el-option label="已付款" value="paid" />
              <el-option label="已退款" value="refunded" />
            </el-select>
          </el-form-item>
          <el-form-item label="销售类型">
            <el-select v-model="searchForm.saleType" placeholder="全部" clearable style="width: 120px">
              <el-option label="零售" value="retail" />
              <el-option label="批发" value="wholesale" />
              <el-option label="网店" value="online" />
            </el-select>
          </el-form-item>
          <el-form-item label="日期范围">
            <el-date-picker
              v-model="searchForm.startDate"
              type="date"
              placeholder="开始日期"
              style="width: 140px"
            />
            <span style="margin: 0 8px">至</span>
            <el-date-picker
              v-model="searchForm.endDate"
              type="date"
              placeholder="结束日期"
              style="width: 140px"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">
              <template #icon>
                <i class="ep:search" />
              </template>
              搜索
            </el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar-section">
      <el-card>
        <div class="toolbar">
          <div class="toolbar-left">
            <el-button type="primary" @click="handleAdd">
              <template #icon>
                <i class="ep:plus" />
              </template>
              新增销售单
            </el-button>
          </div>
          <div class="toolbar-right">
            <el-button type="success">
              <template #icon>
                <i class="ep:download" />
              </template>
              导出Excel
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 表格区域 -->
    <div class="table-section">
      <el-card>
        <el-table
          :data="sales"
          v-loading="loading"
          stripe
          style="width: 100%"
        >
          <el-table-column prop="orderNo" label="订单号" width="150" />
          <el-table-column prop="customerName" label="客户姓名" width="100" />
          <el-table-column prop="customerPhone" label="客户电话" width="130" />
          <el-table-column prop="totalAmount" label="订单金额" width="100" align="right">
            <template #default="{ row }">
              <span class="amount">¥{{ row.totalAmount.toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="订单状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="statusMap[(row.status as StatusKey)].type" size="small">
                {{ statusMap[(row.status as StatusKey)].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="paymentStatus" label="付款状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="paymentStatusMap[(row.paymentStatus as PayStatusKey)].type" size="small">
                {{ paymentStatusMap[(row.paymentStatus as PayStatusKey)].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createTime" label="创建时间" width="150" />
          <el-table-column label="操作" width="300" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" size="small" @click="handleEdit(row)">
                编辑
              </el-button>
              <el-dropdown @command="(command) => handleStatusChange(row.id, command as StatusKey)">
                <el-button type="warning" size="small">
                  状态操作<i class="ep:arrow-down ml-1" />
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="confirmed" :disabled="row.status !== 'pending'">
                      确认订单
                    </el-dropdown-item>
                    <el-dropdown-item command="shipped" :disabled="row.status !== 'confirmed'">
                      发货
                    </el-dropdown-item>
                    <el-dropdown-item command="completed" :disabled="row.status !== 'shipped'">
                      完成
                    </el-dropdown-item>
                    <el-dropdown-item command="cancelled" :disabled="['completed', 'cancelled'].includes(row.status)">
                      取消
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button type="danger" size="small" @click="handleDelete(row.id)">
                删除
              </el-button>
              <el-button size="small" @click="() => { const t = (typeof localStorage!== 'undefined' && localStorage.getItem('token')) || ''; const u = t? `/api/print/picking?order_id=${row.id}&token=${encodeURIComponent(t)}` : `/api/print/picking?order_id=${row.id}`; window.open(u,'_blank') }">拣货单</el-button>
              <el-button size="small" @click="() => { const t = (typeof localStorage!== 'undefined' && localStorage.getItem('token')) || ''; const u = t? `/api/print/outbound?order_id=${row.id}&token=${encodeURIComponent(t)}` : `/api/print/outbound?order_id=${row.id}`; window.open(u,'_blank') }">出库单</el-button>
              <el-button size="small" @click="() => { const t = (typeof localStorage!== 'undefined' && localStorage.getItem('token')) || ''; const u = t? `/api/print/shipping-label?order_id=${row.id}&token=${encodeURIComponent(t)}` : `/api/print/shipping-label?order_id=${row.id}`; window.open(u,'_blank') }">面单</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination-section">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="loadSales"
            @current-change="loadSales"
          />
        </div>
      </el-card>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="80%"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="saleForm"
        :rules="rules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="订单号" prop="orderNo">
              <el-input v-model="saleForm.orderNo" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="订单状态" prop="status">
              <el-select v-model="saleForm.status" style="width: 100%">
                <el-option label="待确认" value="pending" />
                <el-option label="已确认" value="confirmed" />
                <el-option label="已发货" value="shipped" />
                <el-option label="已完成" value="completed" />
                <el-option label="已取消" value="cancelled" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="销售类型">
              <el-select v-model="saleForm.saleType" style="width: 100%">
                <el-option label="零售" value="retail" />
                <el-option label="批发" value="wholesale" />
                <el-option label="网店" value="online" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="客户姓名" prop="customerName">
              <el-input v-model="saleForm.customerName" placeholder="请输入客户姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户电话" prop="customerPhone">
              <el-input v-model="saleForm.customerPhone" placeholder="请输入客户电话" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="客户地址" prop="customerAddress">
          <el-input
            v-model="saleForm.customerAddress"
            type="textarea"
            :rows="2"
            placeholder="请输入客户地址"
          />
        </el-form-item>

        <el-form-item label="付款状态" prop="paymentStatus">
          <el-select v-model="saleForm.paymentStatus" style="width: 200px">
            <el-option label="未付款" value="unpaid" />
            <el-option label="已付款" value="paid" />
            <el-option label="已退款" value="refunded" />
          </el-select>
        </el-form-item>

        <!-- 商品列表 -->
        <el-form-item label="商品列表">
          <div style="width: 100%">
            <div class="product-actions">
              <el-button type="primary" @click="openProductDialog">
                <template #icon>
                  <i class="ep:plus" />
                </template>
                添加商品
              </el-button>
            </div>
            
            <el-table :data="saleForm.items" style="width: 100%; margin-top: 16px">
              <el-table-column prop="productName" label="商品名称" />
              <el-table-column prop="size" label="尺码" width="160">
                <template #default="{ row }">
                  <el-select
                    size="small"
                    :model-value="row.skuId"
                    @change="(v:any)=>onEditSize(row, v)"
                    style="width: 140px"
                    :placeholder="row.size || '选择尺码'"
                  >
                    <el-option
                      v-for="s in (productSkusCache[row.productId] || [])"
                      :key="s.id"
                      :value="String(s.id)"
                      :label="`${s.size}${s.status==='disabled'?'(停用)':''} / 库存:${s.stock ?? 0}`"
                      :disabled="s.status==='disabled'"
                    />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column prop="price" label="单价" width="140" align="right">
                <template #default="{ row }">
                  <el-input-number
                    v-model="row.price"
                    :min="0"
                    :step="1"
                    size="small"
                    style="width: 120px"
                    @change="() => onEditPrice(row)"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="quantity" label="数量" width="140" align="center">
                <template #default="{ row }">
                  <el-input-number
                    v-model="row.quantity"
                    :min="0"
                    :step="1"
                    size="small"
                    style="width: 120px"
                    @change="() => onEditQty(row)"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="subtotal" label="小计" width="140" align="right">
                <template #default="{ row }">
                  ¥{{ (row.quantity * row.price).toFixed(2) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80">
                <template #default="{ $index }">
                  <el-button type="danger" size="small" @click="removeItem($index)">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            
            <div class="total-amount">
              <strong>总金额: ¥{{ totalAmount.toFixed(2) }}</strong>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="saleForm.remark"
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="handleCancel">取消</el-button>
          <el-button type="primary" @click="handleSave">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 商品选择对话框 -->
    <el-dialog
      v-model="productDialogVisible"
      title="选择商品与尺码"
      width="70%"
    >
      <el-row :gutter="16">
        <el-col :span="12">
          <el-table
            height="420"
            :data="products"
            @row-click="handleProductSelect"
            highlight-current-row
          >
            <el-table-column prop="name" label="商品名称" />
            <el-table-column prop="category" label="分类" width="100" />
            <el-table-column prop="price" label="价格" width="100" align="right">
              <template #default="{ row }">
                <span v-if="saleForm.saleType==='wholesale'">批发: ¥{{ (row.wholesale_price ?? row.price).toFixed(2) }}</span>
                <span v-else>零售: ¥{{ row.price.toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="stock" label="总库存" width="90" align="right" />
          </el-table>
        </el-col>
        <el-col :span="12">
          <div v-if="selectedProduct" style="margin-bottom: 10px; font-weight: 600; display:flex; align-items:center; justify-content:space-between;">
            <div>已选商品：{{ selectedProduct.name }}</div>
            <div>
              <el-switch v-model="bulkMode" active-text="批量模式" inactive-text="单选模式" />
            </div>
          </div>
          <el-form inline>
            <el-form-item label="条码">
              <el-input v-model="barcodeInput" placeholder="扫描/输入条码后回车" style="width: 220px" @keyup.enter.native.stop="handleScanEnter" />
            </el-form-item>
          </el-form>

          <div class="sku-grid">
            <div
              v-for="sku in productSkus"
              :key="sku.id"
              class="sku-item"
              :class="{ active: String(sku.id)===String(selectedSkuId), disabled: sku.status==='disabled' }"
              @click="!bulkMode && sku.status!=='disabled' && selectSku(sku)"
            >
              <div class="size">{{ sku.size }}</div>
              <div class="meta">库存：{{ sku.stock ?? 0 }}</div>
              <div class="price">¥{{ getDefaultUnitPrice(selectedProduct).toFixed(2) }}</div>
              <div v-if="bulkMode" style="margin-top:6px;">
                <el-input-number v-model="bulkQtyMap[String(sku.id)]" :min="0" :max="sku.stock ?? 9999" :step="1" size="small" style="width:120px" />
              </div>
            </div>
          </div>

          <!-- 无SKU商品的快捷加入区域 -->
          <div v-if="selectedProduct && productSkus.length===0" style="margin-top: 12px; padding: 12px; background: #fdf6ec; border: 1px dashed #f3d19e; border-radius: 4px">
            <div style="margin-bottom:8px; color:#e6a23c;">该商品暂未设置SKU（尺码），可直接按商品加入明细</div>
            <el-form label-width="60px" inline>
              <el-form-item label="数量">
                <el-input-number v-model="productQuantity" :min="1" :step="1" style="width: 120px" />
              </el-form-item>
              <el-form-item label="单价">
                <el-input-number v-model="skuPrice" :min="0" :step="1" style="width: 140px" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="addNoSkuToSale">加入明细（无尺码）</el-button>
              </el-form-item>
            </el-form>
          </div>

          <div v-if="selectedSku && !bulkMode" style="margin-top: 12px; padding: 12px; background: #f5f7fa; border-radius: 4px">
            <el-form label-width="60px" inline>
              <el-form-item label="尺码">
                <el-tag type="info">{{ selectedSku?.size }}</el-tag>
              </el-form-item>
              <el-form-item label="数量">
                <el-input-number v-model="productQuantity" :min="1" :max="selectedSku?.stock ?? 9999" style="width: 120px" />
              </el-form-item>
              <el-form-item label="单价">
                <el-input-number v-model="skuPrice" :min="0" :step="1" style="width: 140px" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="addSkuToSale">加入明细</el-button>
              </el-form-item>
            </el-form>
          </div>

          <div v-if="bulkMode" style="margin-top: 12px; padding: 12px; background: #f5f7fa; border-radius: 4px; display:flex; justify-content:flex-end;">
            <el-button type="primary" @click="addBulkToSale">批量加入明细</el-button>
          </div>
        </el-col>
      </el-row>

      <div style="margin:8px 0; text-align:right">
        <el-button type="primary" link @click="quickCreateVisible = !quickCreateVisible">{{ quickCreateVisible ? '收起' : '快速新增商品' }}</el-button>
      </div>
      <el-card v-if="quickCreateVisible" class="box-card" shadow="never" style="margin-bottom:10px">
        <el-form :model="quickForm" label-width="90px">
          <el-form-item label="名称">
            <el-input v-model="quickForm.name" placeholder="商品名称" />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="quickForm.category" placeholder="选择分类" filterable>
              <el-option v-for="c in clothingCategories" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
          <el-form-item label="批发价">
            <el-input-number v-model="quickForm.wholesale_price" :min="0" :step="1" />
          </el-form-item>
          <el-form-item label="零售价">
            <el-input-number v-model="quickForm.retail_price" :min="0" :step="1" />
          </el-form-item>
          <el-form-item label="生成SKU">
            <el-switch v-model="quickForm.genSkus" />
            <div v-if="quickForm.genSkus" style="margin-left:12px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
              <el-select v-model="quickForm.skuTemplate" style="width:130px">
                <el-option label="服装尺码" value="apparel" />
                <el-option label="通码(ONE)" value="one" />
              </el-select>
              <el-input v-model="quickForm.baseBarcode" placeholder="条码前缀(可选)" style="width:180px" />
              <el-input-number v-model="quickForm.initStock" :min="0" :step="1" placeholder="初始库存" />
            </div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="createProductQuick">保存并选中</el-button>
            <el-button @click="resetQuickForm">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </el-dialog>
  </div>
</template>

<style scoped>
.sales-management {
  padding: 20px;
}

.search-section,
.toolbar-section,
.table-section {
  margin-bottom: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pagination-section {
  margin-top: 20px;
  text-align: right;
}

.amount {
  font-weight: bold;
  color: #e6a23c;
}

.product-actions {
  display: flex;
  justify-content: flex-end;
}

.total-amount {
  text-align: right;
  margin-top: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 16px;
}

/* SKU 选择区域样式 */
.sku-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  margin-top: 8px;
  max-height: 260px;
  overflow: auto;
}
.sku-item {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  background: #fff;
}
.sku-item.active { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary) inset; }
.sku-item.disabled { opacity: 0.5; cursor: not-allowed; }
.sku-item .size { font-weight: 700; font-size: 13px; }
.sku-item .meta { color: #909399; font-size: 12px; margin-top: 2px; }
.sku-item .price { color: #606266; font-size: 12px; margin-top: 2px; }

/* 响应式设计 */
@media (max-width: 768px) {
  .sales-management {
    padding: 10px;
  }
  
  .el-form--inline .el-form-item {
    display: block;
    margin-bottom: 12px;
  }
  
  .toolbar {
    flex-direction: column;
    gap: 12px;
  }
  
  .el-table {
    font-size: 12px;
  }
  
  .pagination-section {
    text-align: center;
  }
}

@media (max-width: 480px) {
  .el-dialog {
    width: 95% !important;
    margin: 5vh auto;
  }
  
  .el-table-column {
    min-width: 80px;
  }
}
</style>
