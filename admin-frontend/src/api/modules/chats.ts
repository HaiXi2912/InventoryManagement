import api from '../index'

export interface ChatMessage {
  id: number
  session_id: string
  order_id?: number | null
  as_id?: number | null
  from_user_id?: number | null
  from_customer_id?: number | null
  to_user_id?: number | null
  to_customer_id?: number | null
  role: 'customer' | 'agent' | 'system'
  content: string
  content_type: 'text' | 'image' | 'file' | 'system'
  read_status: 'unread' | 'read'
  created_at: string
}

export default {
  listAgentSessions: () => api.get('/chats/sessions'),
  listMySessions: () => api.get('/chats/my/sessions'),
  getSessionMessages: (session_id: string) => api.get(`/chats/sessions/${session_id}/messages`),
  sendMessage: (session_id: string, payload: Partial<ChatMessage> & { content: string; to_user_id?: number; to_customer_id?: number }) =>
    api.post(`/chats/sessions/${session_id}/messages`, payload),
  markRead: (id: number) => api.post(`/chats/messages/${id}/read`),
  markSessionRead: (session_id: string) => api.post(`/chats/sessions/${session_id}/read`),
  startSession: (payload: { session_id?: string; order_id?: number; as_id?: number; peer_user_id?: number; peer_customer_id?: number }) =>
    api.post('/chats/sessions/start', payload),
  unreadCount: () => api.get('/chats/unread/count'),
  readAll: () => api.post('/chats/read-all'),
}
