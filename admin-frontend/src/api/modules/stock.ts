import api from '../index'
import type { ApiResponse } from '../index'

export interface StockAdjustItem {
  sku_id: number | string
  change_qty: number
  reason?: string
  remark?: string
}

export default {
  // 原因码
  getReasons: (): Promise<ApiResponse<{ code: string; name: string }[]>> => api.get('/stock/reasons') as any,

  // 低库存列表（支持 threshold、q、status）
  getLowList: (params?: { threshold?: number; q?: string; status?: 'active' | 'disabled' }): Promise<ApiResponse<any[]>> =>
    api.get('/stock/low', { params }) as any,

  // 批量查询SKU
  getSkuBatch: (ids: Array<number | string>): Promise<ApiResponse<any[]>> =>
    api.get('/stock/batch', { params: { ids: ids.join(',') } }) as any,

  // 批量调整库存
  adjust: (items: StockAdjustItem[] | { items: StockAdjustItem[] }): Promise<ApiResponse<any>> =>
    api.post('/stock/adjust', Array.isArray(items) ? items : items) as any,

  // 单个盘点
  stocktake: (data: { sku_id: number | string; actual_qty: number; remark?: string }): Promise<ApiResponse<any>> =>
    api.post('/stock/stocktake', data) as any,

  // 批量盘点
  stocktakeBatch: (items: Array<{ sku_id: number | string; actual_qty: number; remark?: string }> | { items: Array<{ sku_id: number | string; actual_qty: number; remark?: string }> }): Promise<ApiResponse<any>> =>
    api.post('/stock/stocktake/batch', Array.isArray(items) ? items : items) as any,

  // 查看某SKU的占用（pending订单）
  getReservations: (sku_id: number | string): Promise<ApiResponse<any[]>> =>
    api.get(`/stock/sku/${sku_id}/reservations`) as any,

  // 导出库存流水CSV（返回浏览器下载链接）
  exportLogsCsv: (params?: { sku_id?: number | string; date_from?: string; date_to?: string }) =>
    api.get('/stock/logs/export.csv', { params, responseType: 'blob' as any }) as any,
}
