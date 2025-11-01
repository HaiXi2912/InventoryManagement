import api from '../index'

export default {
  // 获取库存列表（商品聚合）
  getInventoryList: (params?: {
    page?: number
    limit?: number
    warehouse_location?: string
    low_stock?: boolean
  }) => api.get('/inventory', { params }),

  // 获取库存详情（按商品ID）
  getInventory: (productId: string) => api.get(`/inventory/product/${productId}`),

  // 商品级库存调整（兼容旧接口）
  adjustInventory: (data: {
    product_id: string
    adjustment_type: 'in' | 'out'
    quantity: number
    reason?: string
    warehouse_location?: string
  }) => api.post('/inventory/adjust', data),

  // 获取库存统计
  getInventoryStats: () => api.get('/inventory/statistics'),

  // 获取仓库列表
  getWarehouses: () => api.get('/inventory/warehouses'),

  // ----------------- SKU 级接口（/api/stock） -----------------
  // 批量查询 SKU（ids=1,2,3）
  getSkuBatch: (ids: number[] | string) => {
    const idstr = Array.isArray(ids) ? ids.join(',') : String(ids)
    return api.get('/stock/batch', { params: { ids: idstr } })
  },

  // 批量调整 SKU 库存：[{ sku_id, change_qty, reason, remark }]
  adjustSkus: (items: Array<{ sku_id: number | string; change_qty: number; reason?: string; remark?: string }>) => api.post('/stock/adjust', items),

  // 单 SKU 盘点
  stocktakeSku: (sku_id: number | string, actual_qty: number, remark?: string) => api.post('/stock/stocktake', { sku_id, actual_qty, remark }),

  // 批量盘点
  stocktakeBatch: (items: Array<{ sku_id: number | string; actual_qty: number; remark?: string }>) => api.post('/stock/stocktake/batch', { items }),

  // 获取 SKU 占用（订单预占）
  getSkuReservations: (skuId: number | string) => api.get(`/stock/sku/${skuId}/reservations`),

  // 导出库存流水 CSV
  exportLogs: (params?: { sku_id?: number | string; date_from?: string; date_to?: string }) => api.get('/stock/logs/export.csv', { params }),

  // 获取原因码
  getReasons: () => api.get('/stock/reasons'),

  // 获取低库存 SKU 列表
  getLowStock: (params?: { threshold?: number; q?: string; status?: string }) => api.get('/stock/low', { params }),

  // 获取 SKU 指标（总销量、近30天销量）
  getSkuMetrics: (ids: Array<number|string>) => api.get('/stock/sku/metrics', { params: { ids: ids.join(',') } }),
}
