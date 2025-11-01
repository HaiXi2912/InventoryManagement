import api from '../index'

export interface AfterSaleItem {
  id: number
  as_id: number
  order_item_id: number
  sku_id: number
  quantity: number
  amount: number
}

export interface AfterSaleDetail {
  id: number
  as_no: string
  order_id: number
  customer_id?: number | null
  type: 'refund' | 'return' | 'exchange'
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'rejected'
  refund_amount: number
  remark?: string
  items: AfterSaleItem[]
  created_at?: string
}

export default {
  list: (params: any) => api.get('/after-sales', { params }),
  detail: (id: number) => api.get(`/after-sales/${id}`),
  approve: (id: number) => api.post(`/after-sales/${id}/approve`, {}),
  inspect: (id: number, payload: { passed: boolean; remark?: string }) => api.post(`/after-sales/${id}/inspect`, payload),
  complete: (id: number, payload?: { exchange_to?: Array<{ from_item_id: number; to_sku_id: number; quantity: number }> }) => api.post(`/after-sales/${id}/complete`, payload || {}),
  cancel: (id: number) => api.post(`/after-sales/${id}/cancel`, {}),
  walletTransfer: (payload: { customer_id: number; amount: number; remark?: string }) => api.post('/after-sales/wallet/transfer', payload),
}
