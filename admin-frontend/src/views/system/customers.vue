<route lang="yaml">
meta:
  title: 散户用户
  icon: ep:user
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

interface CustomerItem {
  id: number
  name: string
  code?: string
  phone?: string
  email?: string
  customer_type?: 'retail'|'channel'|'vip'
  status?: 'active'|'inactive'
  wallet_balance?: number
}

const loading = ref(false)
const list = ref<CustomerItem[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(10)
const keyword = ref('')
const type = ref<string>('')
const status = ref<string>('')

const types = [
  { label: '零售', value: 'retail' },
  { label: '渠道', value: 'channel' },
  { label: 'VIP', value: 'vip' },
]
const statuses = [
  { label: '启用', value: 'active' },
  { label: '禁用', value: 'inactive' },
]

async function fetchList(){
  loading.value = true
  try{
    const res = await api.get('/customers', { params: { page: page.value, limit: limit.value, keyword: keyword.value||undefined, type: type.value||undefined, status: status.value||undefined } })
    if(res.success){
      list.value = res.data.items
      total.value = res.data.pagination.total
    } else {
      throw new Error(res.message||'加载失败')
    }
  }catch(e:any){ ElMessage.error(e?.message||'加载失败') }
  finally{ loading.value=false }
}

function resetFilters(){ keyword.value=''; type.value=''; status.value=''; page.value=1; fetchList() }

// 新建/编辑
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref<Partial<CustomerItem>>({ customer_type: 'retail', status: 'active' })

function openCreate(){ isEdit.value=false; form.value = { customer_type:'retail', status:'active' }; dialogVisible.value=true }
function openEdit(row: CustomerItem){ isEdit.value=true; form.value = { ...row }; dialogVisible.value=true }

async function submit(){
  try{
    if(isEdit.value){
      await api.put(`/customers/${form.value.id}`, form.value)
      ElMessage.success('已保存')
    }else{
      if(!form.value.name){ ElMessage.warning('请输入姓名'); return }
      await api.post('/customers', form.value)
      ElMessage.success('已创建')
    }
    dialogVisible.value=false
    fetchList()
  }catch(e:any){ ElMessage.error(e?.message||'提交失败') }
}

async function adjustBalance(row: CustomerItem){
  try{
    const { value } = await ElMessageBox.prompt('输入调整金额：正数充值，负数扣减', '余额调整', { inputPattern:/^-?\d+(?:\.\d{1,2})?$/, inputErrorMessage:'金额格式不正确' })
    const amount = Number(value)
    const ret = await api.post(`/customers/${row.id}/wallet/adjust`, { amount, type: amount>0?'recharge':'adjust', remark:'后台调账' })
    row.wallet_balance = Number(ret?.data?.balance ?? row.wallet_balance ?? 0)
    ElMessage.success(`余额：${(row.wallet_balance||0).toFixed(2)}`)
  }catch(_){/* 取消 */}
}

onMounted(fetchList)
</script>

<template>
  <div class="customers-page">
    <el-card shadow="never" class="mb-2">
      <el-form inline @submit.prevent>
        <el-form-item label="关键字"><el-input v-model="keyword" placeholder="姓名/编码/手机" style="width:220px" clearable @keyup.enter.native="fetchList" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="type" clearable style="width:160px"><el-option v-for="t in types" :key="t.value" :label="t.label" :value="t.value" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="status" clearable style="width:140px"><el-option v-for="s in statuses" :key="s.value" :label="s.label" :value="s.value" /></el-select></el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList"><FaIcon name="i-ep:search" /> 查询</el-button>
          <el-button @click="resetFilters"><FaIcon name="i-ep:refresh" /> 重置</el-button>
          <el-button type="success" @click="openCreate"><FaIcon name="i-ep:plus" /> 新建用户</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="list" v-loading="loading" border stripe style="width:100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="姓名" min-width="120" />
        <el-table-column prop="code" label="编码" width="120" />
        <el-table-column prop="phone" label="手机" width="120" />
        <el-table-column prop="email" label="邮箱" min-width="160" />
        <el-table-column prop="customer_type" label="类型" width="100">
          <template #default="{row}"><el-tag>{{ types.find(t=>t.value===row.customer_type)?.label || row.customer_type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="wallet_balance" label="余额" width="120">
          <template #default="{row}">¥{{ Number(row.wallet_balance||0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{row}"><el-tag :type="row.status==='active'?'success':'info'">{{ statuses.find(s=>s.value===row.status)?.label || row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{row}">
            <el-button size="small" type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="warning" @click="adjustBalance(row)">余额调整</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination v-model:current-page="page" v-model:page-size="limit" :page-sizes="[10,20,50,100]" layout="total, sizes, prev, pager, next, jumper" :total="total" @current-change="fetchList" @size-change="() => { page=1; fetchList() }" />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit?'编辑散户':'新建散户'" width="560px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="手机"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="form.customer_type" style="width:200px"><el-option v-for="t in types" :key="t.value" :label="t.label" :value="t.value" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status" style="width:200px"><el-option v-for="s in statuses" :key="s.value" :label="s.label" :value="s.value" /></el-select></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.mb-2{ margin-bottom: 12px; }
.pagination{ display:flex; justify-content:center; margin-top: 12px; }
</style>
