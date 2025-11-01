<template>
  <div class="addr" v-loading="loading">
    <h2>我的收货地址</h2>
    <div class="tools">
      <el-button type="primary" @click="openCreate">新增地址</el-button>
    </div>
    <el-table :data="list" border size="small">
      <el-table-column label="#" type="index" width="60" />
      <el-table-column label="收货人" prop="receiver_name" width="120" />
      <el-table-column label="电话" prop="phone" width="140" />
      <el-table-column label="地址" min-width="320">
        <template #default="{ row }">
          {{ row.province }}{{ row.city }}{{ row.district }} {{ row.detail }}
        </template>
      </el-table-column>
      <el-table-column label="邮编" prop="postcode" width="100" />
      <el-table-column label="默认" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.is_default" type="success" size="small">默认</el-tag>
          <el-link v-else type="primary" :underline="false" @click="setDefault(row.id)">设为默认</el-link>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="editingId? '编辑地址':'新增地址'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="收货人"><el-input v-model="form.receiver_name" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="省"><el-input v-model="form.province" /></el-form-item>
        <el-form-item label="市"><el-input v-model="form.city" /></el-form-item>
        <el-form-item label="区/县"><el-input v-model="form.district" /></el-form-item>
        <el-form-item label="详细地址"><el-input v-model="form.detail" /></el-form-item>
        <el-form-item label="邮编"><el-input v-model="form.postcode" /></el-form-item>
        <el-form-item label="设为默认"><el-switch v-model="form.is_default" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import http from '@/api/http'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const list = ref<any[]>([])
const visible = ref(false)
const editingId = ref<number | null>(null)
const form = ref<any>({ receiver_name:'', phone:'', province:'', city:'', district:'', detail:'', postcode:'', is_default:false })

async function load(){
  loading.value = true
  try{
    const r = await http.get('/api/addresses')
    list.value = r.data?.data || []
  } finally { loading.value = false }
}

function openCreate(){ editingId.value=null; form.value={ receiver_name:'', phone:'', province:'', city:'', district:'', detail:'', postcode:'', is_default:false }; visible.value=true }
function openEdit(row:any){ editingId.value=row.id; form.value={ ...row }; visible.value=true }

async function save(){
  if(editingId.value){
    const r = await http.put(`/api/addresses/${editingId.value}`, form.value)
    if(r.data?.success){ ElMessage.success('已保存'); visible.value=false; load() }
  } else {
    const r = await http.post('/api/addresses', form.value)
    if(r.data?.success){ ElMessage.success('已新增'); visible.value=false; load() }
  }
}

async function remove(row:any){
  await ElMessageBox.confirm('确定删除该地址？','提示',{ type:'warning' }).catch(()=>{ throw new Error('cancel') })
  const r = await http.delete(`/api/addresses/${row.id}`)
  if(r.data?.success){ ElMessage.success('已删除'); load() }
}

async function setDefault(id:number){
  const r = await http.post(`/api/addresses/${id}/default`)
  if(r.data?.success){ ElMessage.success('已设为默认'); load() }
}

onMounted(load)
</script>

<style scoped>
.addr{ max-width: 900px; margin: 20px auto; }
.tools{ margin-bottom:10px }
</style>
