<route lang="yaml">
meta:
  title: 用户管理
  icon: ep:user
  enabled: true
  constant: false
  layout: true
</route>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

interface UserItem {
  id: number
  username: string
  email: string
  real_name?: string
  phone?: string
  role: 'admin'|'manager'|'staff'|'agent'|'factory'
  status: 'active'|'inactive'|'locked'
  created_at?: string
  last_login_at?: string
}

const loading = ref(false)
const users = ref<UserItem[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(10)
const search = ref('')
const role = ref<string>('')
const status = ref<string>('')

// 仅后台/工厂/渠道账号
const roles = [
  { label: '管理员', value: 'admin' },
  { label: '经理', value: 'manager' },
  { label: '员工', value: 'staff' },
  { label: '渠道/代理', value: 'agent' },
  { label: '工厂', value: 'factory' },
]
const statuses = [
  { label: '启用', value: 'active' },
  { label: '禁用', value: 'inactive' },
  { label: '锁定', value: 'locked' },
]

async function fetchList(){
  loading.value = true
  try{
    const res = await api.get('/users', { params: { page: page.value, limit: limit.value, search: search.value||undefined, role: role.value||undefined, status: status.value||undefined } })
    if(res.success){
      // 过滤掉前台 customer 账号，管理端与用户端彻底分离
      const list = (res.data.users || []).filter((u: any) => u.role !== 'customer')
      users.value = list
      total.value = res.data.pagination.total - ((res.data.users||[]).length - list.length)
    } else {
      throw new Error(res.message||'加载失败')
    }
  }catch(e:any){ ElMessage.error(e?.message||'加载失败') }
  finally{ loading.value=false }
}

function resetFilters(){ search.value=''; role.value=''; status.value=''; page.value=1; fetchList() }

// 新建/编辑
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref<Partial<UserItem> & { password?: string }>({ role: 'staff', status: 'active' })

function openCreate(){ isEdit.value=false; form.value = { role:'staff', status:'active' }; dialogVisible.value=true }
function openEdit(row: UserItem){ isEdit.value=true; const { id, username, email, real_name, phone, role, status } = row; form.value = { id, username, email, real_name, phone, role, status }; dialogVisible.value=true }

function buildPatch(payload: any, forCreate = false){
  const patch: any = {}
  const usernameOk = typeof payload.username === 'string' && /^[A-Za-z0-9]{3,30}$/.test(payload.username)
  const emailOk = typeof payload.email === 'string' && /.+@.+\..+/.test(payload.email)
  if (forCreate) {
    if (!usernameOk) throw new Error('用户名需为3-30位字母或数字')
    if (!emailOk) throw new Error('邮箱格式不正确')
    if (!payload.password || !/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(payload.password)) throw new Error('密码需≥6位且包含字母和数字')
    patch.username = payload.username
    patch.email = payload.email
    patch.password = payload.password
  } else {
    if (usernameOk) patch.username = payload.username
    if (emailOk) patch.email = payload.email
  }
  if (payload.real_name !== undefined) patch.real_name = payload.real_name ?? ''
  if (payload.phone !== undefined) patch.phone = payload.phone ?? ''
  if (payload.role) patch.role = payload.role
  if (payload.status) patch.status = payload.status
  return patch
}

async function submit(){
  try{
    if(isEdit.value){
      const patch = buildPatch(form.value, false)
      if (Object.keys(patch).length === 0) { ElMessage.info('无变更'); return }
      await api.put(`/users/${form.value.id}`, patch)
      ElMessage.success('已保存')
    }else{
      const data = buildPatch(form.value, true)
      await api.post('/users', data)
      ElMessage.success('已创建')
    }
    dialogVisible.value=false
    fetchList()
  }catch(e:any){ ElMessage.error(e?.message||'提交失败') }
}

async function toggleStatus(row: UserItem){
  const next = row.status==='active'?'inactive':'active'
  try{ await api.put(`/users/${row.id}`, { status: next }); row.status = next; ElMessage.success('已更新') }catch(e:any){ ElMessage.error(e?.message||'失败') }
}

async function resetPassword(row: UserItem){
  try{
    const { value } = await ElMessageBox.prompt('输入新密码（至少6位，含字母和数字）', '重置密码', { inputType:'password', inputPattern:/^(?=.*[A-Za-z])(?=.*\d).{6,}$/ })
    await api.put(`/users/${row.id}/reset-password`, { new_password: value })
    ElMessage.success('已重置')
  }catch(_){/* 取消 */}
}

async function disableUser(row: UserItem){
  try{
    await ElMessageBox.confirm(`确定禁用用户 ${row.username} 吗？`, '禁用', { type: 'warning' })
    await api.delete(`/users/${row.id}`)
    ElMessage.success('已禁用')
    fetchList()
  }catch(_){/* 取消 */}
}

onMounted(fetchList)
</script>

<template>
  <div class="users-page">
    <el-card shadow="never" class="mb-2">
      <el-form inline @submit.prevent>
        <el-form-item label="关键字"><el-input v-model="search" placeholder="用户名/姓名/邮箱" style="width:220px" clearable @keyup.enter.native="fetchList" /></el-form-item>
        <el-form-item label="角色"><el-select v-model="role" clearable style="width:160px"><el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="status" clearable style="width:140px"><el-option v-for="s in statuses" :key="s.value" :label="s.label" :value="s.value" /></el-select></el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList"><FaIcon name="i-ep:search" /> 查询</el-button>
          <el-button @click="resetFilters"><FaIcon name="i-ep:refresh" /> 重置</el-button>
          <el-button type="success" @click="openCreate"><FaIcon name="i-ep:plus" /> 新建用户</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="users" v-loading="loading" border stripe style="width:100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="real_name" label="姓名" width="120" />
        <el-table-column prop="email" label="邮箱" min-width="160" />
        <el-table-column prop="phone" label="手机" width="120" />
        <el-table-column prop="role" label="角色" width="110">
          <template #default="{row}"><el-tag>{{ roles.find(r=>r.value===row.role)?.label || row.role }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{row}"><el-tag :type="row.status==='active'?'success':row.status==='locked'?'warning':'info'">{{ statuses.find(s=>s.value===row.status)?.label || row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="last_login_at" label="最近登录" width="160" />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{row}">
            <el-button size="small" type="primary" @click="openEdit(row)"><FaIcon name="i-ep:edit" /> 编辑</el-button>
            <el-button size="small" @click="toggleStatus(row)">{{ row.status==='active'?'禁用':'启用' }}</el-button>
            <el-button size="small" type="warning" @click="resetPassword(row)">重置密码</el-button>
            <el-button size="small" type="danger" @click="disableUser(row)">禁用</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination v-model:current-page="page" v-model:page-size="limit" :page-sizes="[10,20,50,100]" layout="total, sizes, prev, pager, next, jumper" :total="total" @current-change="fetchList" @size-change="() => { page=1; fetchList() }" />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit?'编辑用户':'新建用户'" width="560px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="用户名"><el-input v-model="form.username" :disabled="isEdit" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="姓名"><el-input v-model="form.real_name" /></el-form-item>
        <el-form-item label="手机"><el-input v-model="form.phone" placeholder="11位手机号或留空" /></el-form-item>
        <el-form-item label="角色"><el-select v-model="form.role" style="width:200px"><el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status" style="width:200px"><el-option v-for="s in statuses" :key="s.value" :label="s.label" :value="s.value" /></el-select></el-form-item>
        <el-form-item v-if="!isEdit" label="初始密码"><el-input v-model="form.password" type="password" placeholder="至少6位且包含字母和数字" /></el-form-item>
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
