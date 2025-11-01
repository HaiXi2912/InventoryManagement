import api, { type ApiResponse } from '@/api'

export interface AdminOrderItem {
  id: number
  order_no: string
  user_id: number
  status: 'pending'|'paid'|'shipped'|'completed'|'cancelled'
  pay_status: 'unpaid'|'paid'
  total_amount: number
  pay_amount: number
  tracking_no?: string
  logistics_provider?: string
  shipped_at?: string
  delivered_at?: string
  address?: any
  items?: Array<{ id:number; product_id:number; sku_id:number; name:string; size?:string; color?:string; barcode?:string; price:number; quantity:number; amount:number }>
}

export default {
  list(params: { page?: number; limit?: number; status?: string; q?: string }): Promise<ApiResponse<{ items: AdminOrderItem[]; pagination: any }>> {
    return api.get('/admin/orders', { params })
  },
  detail(id: number): Promise<ApiResponse<AdminOrderItem>> {
    return api.get(`/admin/orders/${id}`)
  },
  ship(id: number, payload: { tracking_no: string; logistics_provider?: string }): Promise<ApiResponse> {
    return api.post(`/admin/orders/${id}/ship`, payload)
  },
  complete(id: number): Promise<ApiResponse> {
    return api.post(`/admin/orders/${id}/complete`)
  }
}
