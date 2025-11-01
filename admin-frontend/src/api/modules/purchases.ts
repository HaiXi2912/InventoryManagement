import api from '../index'
import type { ApiResponse } from '../index'

export default {
  // 获取进货单列表（历史只读）
  getList: (params?: {
    page?: number
    size?: number
    status?: string
    payment_status?: string
    purchase_no?: string
    start_date?: string
    end_date?: string
    operator_id?: string
  }): Promise<ApiResponse<any>> => api.get('/purchases', { params }) as any,

  // 获取进货单详情（历史只读）
  getById: (id: string): Promise<ApiResponse<any>> => api.get(`/purchases/${id}`) as any,

  // 以下写操作已下线，调用将返回错误
  create: (_data: any): Promise<ApiResponse<any>> => api.post('/purchases', {}) as any,
  update: (id: string, _data: any): Promise<ApiResponse<any>> => api.put(`/purchases/${id}`, {}) as any,
  remove: (id: string): Promise<ApiResponse<any>> => api.delete(`/purchases/${id}`) as any,
  confirm: (id: string): Promise<ApiResponse<any>> => api.post(`/purchases/${id}/confirm`, {}) as any,
  receive: (id: string, _data: any): Promise<ApiResponse<any>> => api.post(`/purchases/${id}/receive`, {}) as any,
  cancel: (id: string, data?: { reason?: string }): Promise<ApiResponse<any>> => api.post(`/purchases/${id}/cancel`, data || {}) as any,
  approve: (id: string): Promise<ApiResponse<any>> => api.post(`/purchases/${id}/approve`, {}) as any,

  // 统计（无供应商维度）
  statisticsSummary: (params?: {
    start_date?: string
    end_date?: string
    status?: string
  }): Promise<ApiResponse<any>> => api.get('/purchases/statistics/summary', { params }) as any,

  // 最近采购价（按商品）
  getLastPrice: (params: { product_id: string | number }): Promise<ApiResponse<any>> =>
    api.get('/purchases/prices/last', { params }) as any,

  // 价格建议：最近N次、均值/中位数（按商品）
  getPriceSuggestions: (params: { product_id: string | number, limit?: number }): Promise<ApiResponse<any>> =>
    api.get('/purchases/prices/suggestions', { params }) as any,
}
