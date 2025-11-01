import api from '../index'
import type { ApiResponse } from '../index'

export interface SaleListParams {
  page?: number
  size?: number
  status?: string
  payment_status?: string
  customer_id?: string | number
  sale_no?: string
  sale_type?: 'retail' | 'wholesale' | 'online'
  start_date?: string
  end_date?: string
  operator_id?: string | number
}

export interface CreateSalePayload {
  customer_id?: number | null
  sale_date: string
  sale_type?: 'retail' | 'wholesale' | 'online'
  discount_amount?: number
  remark?: string
  // 新增：尺码分配（按商品）
  size_plans?: Record<string | number, Array<{ size: string; qty: number; sku_id?: number | string; unit_price?: number }>>

  details: Array<{
    product_id: number | string
    // 兼容老字段：允许传 sku_id，但后端将以 size_plans 聚合为准
    sku_id?: number | string
    quantity: number
    unit_price: number
    remark?: string
  }>
}

const SalesAPI = {
  // 获取销售单列表
  getSaleList: (params?: SaleListParams) => api.get('/sales', { params }),

  // 获取销售单详情
  getSaleDetail: (id: string | number) => api.get(`/sales/${id}`),

  // 创建销售单（支持 size_plans）
  createSale: (data: CreateSalePayload) => api.post('/sales', data),

  // 更新销售单
  updateSale: (id: string, data: any): Promise<ApiResponse<any>> => api.put(`/sales/${id}`, data) as any,

  // 删除销售单
  removeSale: (id: string): Promise<ApiResponse<any>> => api.delete(`/sales/${id}`) as any,

  // 确认销售单
  confirmSale: (id: string | number) => api.post(`/sales/${id}/confirm`, {}),

  // 发货
  shipSale: (id: string | number, data?: { shipping_info?: string }) => api.post(`/sales/${id}/ship`, data || {}),

  // 完成
  completeSale: (id: string | number) => api.post(`/sales/${id}/complete`, {}),

  // 取消销售
  cancelSale: (id: string | number, data?: { reason?: string }) => api.post(`/sales/${id}/cancel`, data || {}),
}

export default SalesAPI
