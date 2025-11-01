<template>
  <div class="chat">
    <header class="hd">
      <span>客服聊天</span>
      <span class="unread" v-if="unread>0">未读 {{ unread }}</span>
    </header>
    <section class="msgs" ref="msgsRef">
      <div v-for="m in messages" :key="m.id" :class="['msg', m.role]">
        <div class="bubble">
          <span class="role">{{ m.role }}</span>
          <span class="content">{{ m.content }}</span>
          <span class="time">{{ m.created_at }}</span>
        </div>
      </div>
    </section>
    <footer class="ft">
      <input v-model="input" @keyup.enter="send" placeholder="输入消息，回车发送" />
      <button @click="send" :disabled="sending">发送</button>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'

const sessionId = ref('')
const messages = ref([])
const input = ref('')
const sending = ref(false)
const unread = ref(0)
const msgsRef = ref(null)

async function api(path, opts={}){
  const token = localStorage.getItem('token')
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type':'application/json', ...(token? { Authorization:`Bearer ${token}` }: {}) }, ...opts })
  const data = await res.json().catch(()=>({}))
  return { status: res.status, body: data }
}

async function loadUnread(){
  const r = await api('/chats/unread/count')
  if (r.status===200) unread.value = r.body?.data?.unread || 0
}

function scrollBottom(){
  const el = msgsRef.value
  if (el) el.scrollTop = el.scrollHeight
}

async function ensureSession(){
  const r = await api('/chats/sessions/start', { method:'POST', body: JSON.stringify({}) })
  if (r.status===200) sessionId.value = r.body?.data?.session_id
}

async function loadMessages(){
  if(!sessionId.value) return
  const r = await api(`/chats/sessions/${sessionId.value}/messages`)
  if (r.status===200) {
    messages.value = r.body?.data || []
    await nextTick(); scrollBottom()
    await api(`/chats/sessions/${sessionId.value}/read`, { method:'POST' })
    await loadUnread()
  }
}

async function send(){
  if(!input.value.trim() || !sessionId.value) return
  sending.value = true
  try{
    const r = await api(`/chats/sessions/${sessionId.value}/messages`, { method:'POST', body: JSON.stringify({ content: input.value }) })
    if ([200,201].includes(r.status)) {
      input.value=''
      await loadMessages()
    }
  } finally {
    sending.value = false
  }
}

onMounted(async ()=>{
  await ensureSession()
  await loadMessages()
  await loadUnread()
  // 轻量轮询
  setInterval(async ()=>{ await loadMessages(); }, 5000)
})
</script>

<style scoped>
.chat{ display:flex; flex-direction:column; height: calc(100vh - 120px); }
.hd{ display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid #eee }
.unread{ color:#e74c3c; font-size:12px }
.msgs{ flex:1; overflow:auto; padding:12px; background:#fafafa }
.msg{ margin:6px 0; display:flex }
.msg.agent{ justify-content:flex-end }
.bubble{ max-width:70%; background:#fff; border:1px solid #eee; border-radius:8px; padding:8px }
.msg.agent .bubble{ background:#e7f1ff }
.role{ color:#999; font-size:12px; margin-right:6px }
.content{ margin-right:6px }
.time{ color:#bbb; font-size:12px }
.ft{ display:flex; gap:8px; padding:8px; border-top:1px solid #eee }
.ft input{ flex:1; padding:6px 8px }
</style>
