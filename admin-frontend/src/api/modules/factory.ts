import api from '../index'

export interface FactoryOrderItem { product_id: number|string; sku_id?: number|string; size?: string; quantity: number; unit_cost: number; remark?: string }

const FactoryAPI = {
  dashboard: () => api.get('/factory/dashboard'),
  list: (params?: any) => api.get('/factory/orders', { params }),
  create: (data: { expedite?: boolean; remark?: string; shipping_fee?: number; items: FactoryOrderItem[] }) => api.post('/factory/orders', data),
  quickAdd: (data: { product_id: number|string; size_quantities: Record<string, number>; unit_cost?: number; expedite?: boolean; remark?: string; shipping_fee?: number }) =>
    api.post('/factory/orders/quick-add', data),
  simplified: (data: { product_id: number|string; size_quantities: Record<string, number>; unit_cost?: number; expedite?: boolean; remark?: string; shipping_fee?: number; auto?: 'none'|'approve'|'start'|'complete'|'ship' }) =>
    api.post('/factory/orders/simplified', data),
  update: (id: number|string, data: Partial<{ expedite: boolean; remark: string; shipping_fee: number }>) => api.put(`/factory/orders/${id}`, data),
  approve: (id: number|string) => api.post(`/factory/orders/${id}/approve`, {}),
  start: (id: number|string) => api.post(`/factory/orders/${id}/start`, {}),
  complete: (id: number|string) => api.post(`/factory/orders/${id}/complete`, {}),
  ship: (id: number|string) => api.post(`/factory/orders/${id}/ship`, {}),
  cancel: (id: number|string) => api.post(`/factory/orders/${id}/cancel`, {}),
  move: (id: number|string, direction: 'up'|'down') => api.post(`/factory/orders/${id}/move`, { direction }),
  autoReplenish: (data?: { threshold?: number; plan?: number }) => api.post('/factory/auto-replenish', data || {}),
  autoReplenishByProduct: (data: { product_id: number|string; threshold?: number; plan?: number; unit_cost?: number }) =>
    api.post('/factory/auto-replenish/product', data),
  // 新增：工厂设置
  getSettings: () => api.get('/factory/settings'),
  saveSettings: (data: { daily_capacity?: number; work_hours_per_day?: number; per_piece_shipping?: number }) => api.post('/factory/settings', data),
}

export default FactoryAPI
