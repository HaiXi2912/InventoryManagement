<template>
  <div class="checkout" v-loading="loading">
    <h2>结算</h2>
    <el-row :gutter="20">
      <el-col :md="16" :sm="24">
        <el-card shadow="never" class="addresses">
          <template #header>收货地址</template>
          <el-radio-group v-model="addressId">
            <el-radio v-for="a in addresses" :key="a.id" :label="a.id">
              {{ a.receiver_name }} / {{ a.phone }} / {{ a.province }}{{ a.city }}{{ a.district }} {{ a.detail }}
              <el-tag v-if="a.is_default" size="small" type="success" style="margin-left:8px">默认</el-tag>
              <el-link v-else type="primary" :underline="false" style="margin-left:8px" @click.stop="setDefault(a.id)">设为默认</el-link>
            </el-radio>
          </el-radio-group>
          <div style="margin-top:10px">
            <el-button size="small" @click="showAddr = true">新增地址</el-button>
          </div>
        </el-card>

        <el-card shadow="never" style="margin-top:16px">
          <template #header>订单明细</template>
          <el-table :data="details" border size="small">
            <el-table-column label="商品" min-width="260">
              <template #default="{ row }">
                <div class="item">
                  <img :src="row.image" />
                  <div>
                    <div class="name">{{ row.name }}</div>
                    <div class="spec">{{ row.size }} / {{ row.color }} （条码：{{ row.barcode }}）</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="price" label="单价" width="120" />
            <el-table-column prop="quantity" label="数量" width="100" />
            <el-table-column prop="amount" label="小计" width="120" />
          </el-table>
        </el-card>
      </el-col>

      <el-col :md="8" :sm="24">
        <el-card shadow="never">
          <template #header>支付</template>
          <div class="pay-tools">
            <el-switch v-model="useWallet" active-text="使用钱包支付" inactive-text="常规支付" />
            <div class="balance">钱包余额：¥{{ wallet.balance.toFixed(2) }}</div>
            <div class="tip" v-if="useWallet && wallet.balance < totalNumber">余额不足，将使用常规支付</div>
          </div>
          <div class="total">合计：¥{{ total }}</div>
          <div class="recharge">
            <el-input v-model.number="rechargeAmount" type="number" placeholder="充值金额" style="width:140px" />
            <el-button size="small" @click="recharge">充值</el-button>
          </div>
          <el-button type="primary" :disabled="!addressId || !details.length" @click="submit">提交订单</el-button>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showAddr" title="新增收货地址" width="520px">
      <el-form :model="addrForm" label-width="90px">
        <el-form-item label="收货人"><el-input v-model="addrForm.receiver_name" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="addrForm.phone" /></el-form-item>
        <el-form-item label="省"><el-input v-model="addrForm.province" /></el-form-item>
        <el-form-item label="市"><el-input v-model="addrForm.city" /></el-form-item>
        <el-form-item label="区/县"><el-input v-model="addrForm.district" /></el-form-item>
        <el-form-item label="详细地址"><el-input v-model="addrForm.detail" /></el-form-item>
        <el-form-item label="设为默认"><el-switch v-model="addrForm.is_default" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddr=false">取消</el-button>
        <el-button type="primary" @click="createAddress">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '@/api/http'
import { useCartStore } from '@/stores/cart'

const router = useRouter()
const loading = ref(false)
const addresses = ref<any[]>([])
const addressId = ref<number | null>(null)
const showAddr = ref(false)
const addrForm = ref<any>({ receiver_name:'', phone:'', province:'', city:'', district:'', detail:'', is_default:false })

const useWallet = ref(true)

const cart = useCartStore()
const details = ref<any[]>([])

const totalNumber = computed(()=> details.value.reduce((a,b)=> a + Number(b.amount||0), 0))
const total = computed(()=> totalNumber.value.toFixed(2))

function parseJwtId(): number | null {
  try{
    const t = localStorage.getItem('token') || ''
    const payload = JSON.parse(decodeURIComponent(escape(window.atob(t.split('.')[1]))))
    return Number(payload?.id || payload?.user_id || null) || null
  }catch{ return null }
}

function normalizeImage(url?: string): string {
  if(!url) return 'https://via.placeholder.com/120x120?text=SKU'
  const u = String(url)
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/')) return u
  // 兼容诸如 "120x120?text=SKU" 之类的相对地址
  if (/^\d+x\d+(\?.*)?$/.test(u)) return `https://via.placeholder.com/${u}`
  return 'https://via.placeholder.com/120x120?text=SKU'
}

async function load(){
  loading.value = true
  try{
    // 地址（失败不阻断）
    try{
      const addrRes = await http.get('/api/addresses')
      if(addrRes.data?.success){
        addresses.value = addrRes.data.data || []
        const def = addresses.value.find((a:any)=>a.is_default)
        addressId.value = def?.id || addresses.value[0]?.id || null
      }
    }catch(e){
      // 404/401 时，不影响后续流程
      addresses.value = []
      addressId.value = null
    }

    // 订单明细从购物车来（每个 SKU 独立兜底异常）
    const list:any[] = []
    for(const it of cart.items){
      try{
        const { data } = await http.get(`/api/catalog/sku/${it.sku_id}`)
        if(data?.success){
          const { sku, product } = data.data
          const mainMedia = product?.media?.find?.((m:any)=>m.is_main) || product?.media?.[0]
          const image = normalizeImage(mainMedia?.url || product?.image_url)
          const quantity = it.quantity
          list.push({
            sku_id: sku.id,
            product_id: sku.product_id,
            name: product?.name || '',
            size: sku.size,
            color: sku.color,
            barcode: sku.barcode,
            image,
            price: Number(sku.retail_price||0),
            quantity,
            amount: +(Number(sku.retail_price||0) * Number(quantity)).toFixed(2),
          })
        }
      }catch{ /* 单个 SKU 失败跳过 */ }
    }
    details.value = list
  } finally { loading.value = false }
}

async function setDefault(id:number){
  const { data } = await http.post(`/api/addresses/${id}/default`)
  if(data?.success){ ElMessage.success('已设为默认'); await load() }
}

async function createAddress(){
  try{
    const { data } = await http.post('/api/addresses', addrForm.value)
    if(data?.success){
      ElMessage.success('已保存')
      showAddr.value = false
      await load()
    } else {
      ElMessage.error(data?.message || '保存失败')
    }
  }catch(e:any){
    const msg = e?.response?.status === 401 ? '未登录或会话已过期，请先登录' : (e?.response?.data?.message || '保存失败，稍后重试')
    ElMessage.error(msg)
  }
}

const wallet = ref<{ balance:number, transactions:any[] }>({ balance:0, transactions:[] })
const rechargeAmount = ref<number | null>(null)

async function loadWallet(){
  try{
    const { data } = await http.get(`/api/wallet/me`)
    if(data?.success){ wallet.value = { balance: Number(data.data?.balance||0), transactions: data.data?.transactions||[] } }
  }catch{}
}

async function recharge(){
  if(!rechargeAmount.value || rechargeAmount.value<=0) return ElMessage.warning('请输入正确金额')
  const { data } = await http.post('/api/wallet/recharge', { amount: rechargeAmount.value })
  if(data?.success){ ElMessage.success('充值成功'); await loadWallet(); rechargeAmount.value = null }
}

onMounted(async ()=>{ await load(); await loadWallet() })

async function submit(){
  if(!addressId.value) return ElMessage.warning('请选择地址')
  if(!details.value.length) return ElMessage.warning('购物车为空')
  const payload = { items: details.value.map(d=>({ sku_id:d.sku_id, quantity:d.quantity })), address_id: addressId.value }
  const { data } = await http.post('/api/orders/checkout', payload)
  if(data?.success){
    ElMessage.success('订单已创建，准备支付...')
    const orderId = data.data.order_id
    const payable = Number(data.data?.pay_amount ?? totalNumber.value)
    let paid = false
    const uid = parseJwtId()
    if(useWallet.value && wallet.value.balance >= payable && uid){
      try{
        const r = await http.post(`/api/orders/${orderId}/pay`, { customer_id: uid })
        if(r.data?.success){ paid = true }
      }catch(e:any){ /* 忽略，走常规支付 */ }
    }
    if(!paid){
      const r2 = await http.post(`/api/orders/${orderId}/pay`)
      if(r2.data?.success){ paid = true }
    }
    await loadWallet()
    if(paid){
      ElMessage.success('支付成功')
      cart.clear()
      router.push('/orders')
    }else{
      ElMessage.error('支付失败，请稍后重试')
    }
  }
}
</script>

<style scoped>
.checkout{ max-width: 1100px; margin: 20px auto; }
.item{ display:flex; gap:12px; align-items:center; }
.item img{ width:56px; height:56px; object-fit:cover; border-radius:6px; }
.name{ font-weight:600; }
.spec{ color:#909399; font-size:12px; }
.total{ font-size:18px; color:#F56C6C; font-weight:700; margin-bottom: 10px; }
.pay-tools{ display:flex; align-items:center; gap:10px; margin-bottom:8px }
.tip{ color:#909399; font-size:12px }
.balance{ color:#606266; font-size:12px }
.recharge{ display:flex; align-items:center; gap:8px; margin-bottom:10px }
</style>
