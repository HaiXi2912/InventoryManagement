<route lang="yaml">
meta:
  title: 客服工作台
</route>

<script setup lang="ts">
import { onMounted, ref, computed, nextTick, onBeforeUnmount } from 'vue'
import chatsApi from '@/api/modules/chats'
import afterSalesApi from '@/api/modules/afterSales'
import { useRouter } from 'vue-router'

interface SessionBrief {
  session_id: string
  last_message: any
  unread_count: number
  order_id?: number | null
  as_id?: number | null
  pinned?: boolean
}

const sessions = ref<SessionBrief[]>([])
const activeSid = ref<string>('')
const messages = ref<any[]>([])
const input = ref('')
const loading = ref(false)
const keyword = ref('')
const unread = ref(0)
const timer = ref<number | null>(null)

const router = useRouter()

const currentSession = computed(() => sessions.value.find(s => s.session_id===activeSid.value))
const filteredSessions = computed(()=> sessions.value.filter(s => !keyword.value || s.session_id.includes(keyword.value) || s.last_message?.content?.includes(keyword.value)).sort((a,b)=> Number(!!b.pinned)-Number(!!a.pinned)))

// 推断当前会话可能关联的客户ID（基于最后一条消息）
const currentCustomerId = computed(()=>{
  const m = currentSession.value?.last_message
  if (!m) return null
  return m.role==='customer' ? (m.from_customer_id || null) : (m.to_customer_id || null)
})

// 钱包转账对话框
const transferVisible = ref(false)
const transferForm = ref<{ customer_id: number | null; amount: number; remark: string }>({ customer_id: null, amount: 0, remark: '' })
function openTransfer() {
  transferForm.value.customer_id = (currentCustomerId.value as any) || null
  transferForm.value.amount = 0
  transferForm.value.remark = ''
  transferVisible.value = true
}
async function submitTransfer(){
  if(!transferForm.value.customer_id || !transferForm.value.amount) return
  try{
    await afterSalesApi.walletTransfer({ customer_id: Number(transferForm.value.customer_id), amount: Number(transferForm.value.amount), remark: transferForm.value.remark })
    transferVisible.value = false
  }catch(e){ /* 由全局拦截提示 */ }
}

function gotoAfterSale(id:number){ router.push({ name:'afterSaleDetail', query:{ id } }) }

async function loadSessions() {
  const res = await chatsApi.listAgentSessions()
  sessions.value = ((res as any).data || []).map((x:any)=>({ ...x, pinned: false }))
  if (!activeSid.value && sessions.value.length) {
    activeSid.value = sessions.value[0].session_id
  }
}

async function loadMessages() {
  if (!activeSid.value) return
  const res = await chatsApi.getSessionMessages(activeSid.value)
  messages.value = (res as any).data || []
  await nextTick()
  scrollBottom()
  // 批量设为已读
  await chatsApi.markSessionRead(activeSid.value)
}

function scrollBottom() {
  const el = document.querySelector('.msgs')
  if (el) el.scrollTop = el.scrollHeight
}

async function send() {
  if (!input.value.trim() || !activeSid.value) return
  loading.value = true
  try {
    await chatsApi.sendMessage(activeSid.value, { content: input.value })
    input.value = ''
    await loadMessages()
  } finally {
    loading.value = false
  }
}

async function newTempSession() {
  const res = await chatsApi.startSession({})
  activeSid.value = (res as any).data?.session_id
  await loadMessages()
  await loadSessions()
}

function togglePin(sid: string) {
  const t = sessions.value.find(x=>x.session_id===sid)
  if (t) t.pinned = !t.pinned
}

async function refreshUnread(){
  try{ const r:any = await chatsApi.unreadCount(); unread.value = r?.data?.unread || 0 } catch {}
}

onMounted(async ()=>{
  await loadSessions()
  await loadMessages()
  await refreshUnread()
  timer.value = window.setInterval(()=>{ refreshUnread() }, 10000)
})

onBeforeUnmount(()=>{ if(timer.value) window.clearInterval(timer.value) })
</script>

<template>
  <div class="cs">
    <aside class="sidebar">
      <div class="tools">
        <el-input v-model="keyword" placeholder="搜索会话/消息" size="small" clearable />
        <el-button size="small" type="primary" @click="newTempSession">新建会话</el-button>
      </div>
      <h3>我的会话</h3>
      <ul>
        <li v-for="s in filteredSessions" :key="s.session_id" :class="{active: s.session_id===activeSid}" @click="activeSid=s.session_id; loadMessages()">
          <div class="row1">
            <div class="sid">{{ s.session_id }}</div>
            <el-button link size="small" @click.stop="togglePin(s.session_id)">{{ s.pinned ? '取消固定' : '固定' }}</el-button>
          </div>
          <div class="last">{{ s.last_message?.content }}</div>
          <div class="meta">
            <span v-if="s.order_id">订单#{{ s.order_id }}</span>
            <span v-if="s.as_id">
              售后#
              <el-link type="primary" :underline="false" @click.stop="gotoAfterSale(s.as_id)">{{ s.as_id }}</el-link>
            </span>
            <el-tag v-if="s.unread_count" type="danger" size="small">{{ s.unread_count }}</el-tag>
          </div>
        </li>
      </ul>
    </aside>
    <main class="panel" v-if="activeSid">
      <header class="hd">
        <div>
          <b>会话：</b>{{ activeSid }}
        </div>
        <div class="hd-actions">
          <el-tag type="danger" size="small" v-if="unread">未读 {{ unread }}</el-tag>
          <el-button size="small" @click="refreshUnread">未读</el-button>
          <el-button size="small" @click="loadMessages">刷新</el-button>
          <el-button size="small" @click="() => chatsApi.readAll().then(refreshUnread)">全部已读</el-button>
          <el-divider direction="vertical" />
          <el-button size="small" type="warning" @click="openTransfer">钱包转账</el-button>
          <template v-if="currentSession?.as_id">
            <el-button size="small" type="primary" @click="gotoAfterSale(currentSession!.as_id!)">售后详情</el-button>
          </template>
        </div>
      </header>
      <section class="msgs">
        <div v-for="m in messages" :key="m.id" :class="['msg', m.role]">
          <div class="bubble">
            <span class="role">{{ m.role }}</span>
            <span class="content">{{ m.content }}</span>
            <span class="time">{{ m.created_at }}</span>
          </div>
        </div>
      </section>
      <footer class="ft">
        <el-input v-model="input" :disabled="loading" placeholder="输入消息，回车发送" @keyup.enter="send" />
        <el-button type="primary" :loading="loading" @click="send">发送</el-button>
      </footer>

      <el-dialog v-model="transferVisible" title="钱包转账" width="420px">
        <div class="inline">
          <el-input v-model.number="(transferForm as any).customer_id" placeholder="客户ID" size="small" style="width:140px" />
          <el-input-number v-model="transferForm.amount" :min="-999999" :max="999999" :precision="2" :step="10" size="small" />
          <el-input v-model="transferForm.remark" placeholder="备注" size="small" style="width:160px" />
        </div>
        <template #footer>
          <el-button @click="transferVisible=false" size="small">取消</el-button>
          <el-button type="primary" size="small" @click="submitTransfer">确认转账</el-button>
        </template>
      </el-dialog>
    </main>
    <main v-else class="panel empty">请选择左侧会话</main>
  </div>
</template>

<style scoped>
.cs{ display:flex; height: calc(100vh - 120px); }
.sidebar{ width:300px; border-right:1px solid #eee; padding:10px; overflow:auto }
.tools{ display:flex; gap:6px; margin-bottom:8px; align-items:center; white-space:nowrap }
.tools :deep(.el-input__wrapper){ height:28px }
.sidebar ul{ list-style:none; margin:0; padding:0 }
.sidebar li{ padding:8px; border-bottom:1px solid #f3f3f3; cursor:pointer }
.sidebar li.active{ background:#f6f9ff }
.row1{ display:flex; justify-content:space-between; align-items:center; gap:8px; white-space:nowrap }
.sid{ font-weight:600; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.last{ color:#666; font-size:12px; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.meta{ display:flex; gap:8px; align-items:center; margin-top:4px; white-space:nowrap }
.meta span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.panel{ flex:1; display:flex; flex-direction:column }
.panel .hd{ display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #eee; white-space:nowrap }
.hd-actions{ display:flex; gap:8px; align-items:center }
.msgs{ flex:1; overflow:auto; padding:12px; background:#fafafa }
.msg{ margin:6px 0; display:flex }
.msg.agent{ justify-content:flex-end }
.msg .bubble{ max-width:60%; background:#fff; border:1px solid #eee; border-radius:8px; padding:8px; word-break:break-word }
.msg.agent .bubble{ background:#e7f1ff }
.role{ color:#999; font-size:12px; margin-right:6px; white-space:nowrap }
.content{ margin-right:6px }
.time{ color:#bbb; font-size:12px; white-space:nowrap }
.ft{ display:flex; gap:8px; padding:8px; border-top:1px solid #eee; white-space:nowrap }
.empty{ display:flex; align-items:center; justify-content:center; color:#999 }
.inline{ display:flex; gap:6px; align-items:center; flex-wrap:wrap }
</style>
