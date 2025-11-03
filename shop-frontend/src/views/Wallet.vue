<template>
  <div class="wallet">
    <el-card shadow="never">
      <template #header>我的钱包</template>
      <div class="balance">余额：<b>¥{{ balance.toFixed(2) }}</b></div>
      <el-table :data="txs" border size="small" style="margin-top:10px">
        <el-table-column prop="id" label="#" width="70"/>
        <el-table-column prop="type" label="类型" width="100"/>
        <el-table-column prop="change_amount" label="变动金额" width="120"/>
        <el-table-column prop="before_balance" label="期初" width="120"/>
        <el-table-column prop="after_balance" label="期末" width="120"/>
        <el-table-column prop="remark" label="备注" />
        <el-table-column prop="created_at" label="时间" width="180"/>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import http from '@/api/http'

const balance = ref(0)
const txs = ref<any[]>([])

async function load(){
  const { data } = await http.get('/api/wallet/me')
  if(data?.success){ balance.value = Number(data.data?.balance||0); txs.value = data.data?.transactions||[] }
}

onMounted(load)
</script>

<style scoped>
.wallet{ max-width:960px; margin:20px auto }
.balance{ font-size:16px }
</style>
