<route lang="yaml">
meta:
  title: 工厂结算
  icon: ep:coin
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import FinanceAPI from '@/api/modules/finance'

const loading = ref(false)

// 筛选
const date = ref<string>(new Date().toISOString().split('T')[0])
const period = ref<string>(new Date().toISOString().slice(0,7))

// 日/月关账摘要（显示应付基数）
const daily = ref<any>(null)
const monthly = ref<any>(null)

// 结算填写
const dailyAmount = ref<number | null>(null)
const dailyMethod = ref<string>('transfer')
const dailyRemark = ref<string>('')

const monthlyAmount = ref<number | null>(null)
const monthlyMethod = ref<string>('transfer')
const monthlyRemark = ref<string>('')

// 记录
const payments = ref<any[]>([])
const pager = ref({ page: 1, size: 10, total: 0 })
const filters = ref<{ scope_type?: 'daily'|'monthly'; scope_value?: string }>({})

function fmt(n: any){ return Number(n||0) }
function money(n: any){ return fmt(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

async function loadSummary(){
  loading.value = true
  try{
    const [d, m] = await Promise.all([
      FinanceAPI.getDaily(date.value),
      FinanceAPI.getMonthly(period.value),
    ])
    daily.value = d?.data || null
    monthly.value = m?.data || null
  }catch{ ElMessage.error('加载摘要失败') } finally { loading.value=false }
}

async function doSettleDaily(){
  try{
    const payload: any = { date: date.value, method: dailyMethod.value, remark: dailyRemark.value }
    if (dailyAmount.value && dailyAmount.value > 0) payload.amount = dailyAmount.value
    const r = await FinanceAPI.settleDaily(payload)
    ElMessage.success('日清结算成功')
    await loadSummary(); await loadPayments()
  }catch(err){ ElMessage.error((err as any)?.response?.data?.message || '日清结算失败') }
}

async function doSettleMonthly(){
  try{
    const payload: any = { period: period.value, method: monthlyMethod.value, remark: monthlyRemark.value }
    if (monthlyAmount.value && monthlyAmount.value > 0) payload.amount = monthlyAmount.value
    const r = await FinanceAPI.settleMonthly(payload)
    ElMessage.success('月结结算成功')
    await loadSummary(); await loadPayments()
  }catch(err){ ElMessage.error((err as any)?.response?.data?.message || '月结结算失败') }
}

async function loadPayments(){
  try{
    const { page, size } = pager.value
    const params: any = { page, size, ...filters.value }
    const r = await FinanceAPI.getFactoryPayments(params)
    payments.value = r?.data?.list || []
    pager.value.total = r?.data?.pagination?.total || 0
  }catch{ payments.value=[] }
}

function onPageChange(p: number){ pager.value.page = p; loadPayments() }
function onSizeChange(s: number){ pager.value.size = s; loadPayments() }

onMounted(async()=>{ await loadSummary(); await loadPayments() })
</script>

<template>
  <div class="p-4 space-y-4" v-loading="loading">
    <el-card>
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="font-600">工厂结算</div>
          <div class="space-x-2">
            <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" placeholder="选择日清日期" />
            <el-date-picker v-model="period" type="month" value-format="YYYY-MM" placeholder="选择月份" />
            <el-button size="small" @click="loadSummary">刷新</el-button>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <el-card shadow="never">
          <template #header>日清结算</template>
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="日清日期">{{ date }}</el-descriptions-item>
            <el-descriptions-item label="应付基数(完成)">¥{{ money(daily?.total_factory_cost) }}</el-descriptions-item>
            <el-descriptions-item label="AP/AR">AP: ¥{{ money(daily?.breakdown?.ap) }}，AR: ¥{{ money(daily?.breakdown?.ar) }}</el-descriptions-item>
          </el-descriptions>
          <div class="mt-3 flex items-center gap-2 flex-wrap">
            <el-input-number v-model="dailyAmount" :min="0" :step="100" placeholder="金额(留空=按基数)" />
            <el-select v-model="dailyMethod" placeholder="方式" style="width: 140px">
              <el-option label="转账" value="transfer" />
              <el-option label="现金" value="cash" />
              <el-option label="银行卡" value="card" />
              <el-option label="支付宝" value="alipay" />
              <el-option label="微信" value="wechat" />
              <el-option label="其他" value="other" />
            </el-select>
            <el-input v-model="dailyRemark" placeholder="备注" style="width: 240px" />
            <el-button type="primary" @click="doSettleDaily">去结算</el-button>
          </div>
          <div class="tip">不填金额默认按“应付基数”结算</div>
        </el-card>

        <el-card shadow="never">
          <template #header>月结结算</template>
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="结算月份">{{ period }}</el-descriptions-item>
            <el-descriptions-item label="应付基数(完成)">¥{{ money(monthly?.total_factory_cost) }}</el-descriptions-item>
            <el-descriptions-item label="扣除说明">若今日已做日清，将自动扣除今日金额</el-descriptions-item>
          </el-descriptions>
          <div class="mt-3 flex items-center gap-2 flex-wrap">
            <el-input-number v-model="monthlyAmount" :min="0" :step="100" placeholder="金额(留空=基数-当日已结)" />
            <el-select v-model="monthlyMethod" placeholder="方式" style="width: 140px">
              <el-option label="转账" value="transfer" />
              <el-option label="现金" value="cash" />
              <el-option label="银行卡" value="card" />
              <el-option label="支付宝" value="alipay" />
              <el-option label="微信" value="wechat" />
              <el-option label="其他" value="other" />
            </el-select>
            <el-input v-model="monthlyRemark" placeholder="备注" style="width: 240px" />
            <el-button type="primary" @click="doSettleMonthly">去结算</el-button>
          </div>
          <div class="tip">不填金额默认按“应付基数-当日已结”结算</div>
        </el-card>
      </div>
    </el-card>

    <el-card>
      <template #header>
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="font-600">结算记录</div>
          <div class="space-x-2">
            <el-select v-model="filters.scope_type" placeholder="全部类型" clearable style="width: 120px">
              <el-option label="日清" value="daily" />
              <el-option label="月结" value="monthly" />
            </el-select>
            <el-input v-model="filters.scope_value" placeholder="日期或月份" clearable style="width: 180px" />
            <el-button size="small" @click="loadPayments">查询</el-button>
          </div>
        </div>
      </template>

      <el-table :data="payments" size="small" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="scope_type" label="类型" width="100">
          <template #default="{ row }"><el-tag size="small" :type="row.scope_type==='daily' ? 'primary' : 'success'">{{ row.scope_type==='daily' ? '日清' : '月结' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="scope_value" label="范围" width="140" />
        <el-table-column prop="amount" label="金额(¥)" width="140">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="method" label="方式" width="120" />
        <el-table-column prop="paid_at" label="支付时间" width="180" />
        <el-table-column prop="remark" label="备注" />
      </el-table>
      <div class="flex justify-end mt-2">
        <el-pagination
          layout="total, sizes, prev, pager, next, jumper"
          :total="pager.total"
          v-model:page-size="pager.size"
          v-model:current-page="pager.page"
          @size-change="onSizeChange"
          @current-change="onPageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.tip { margin-top: 6px; font-size: 12px; color: #909399 }
</style>
