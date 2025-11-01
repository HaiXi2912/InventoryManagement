import api from '../index'

export interface OverviewParams {
  start_date?: string
  end_date?: string
}

export interface DailyParams {
  date?: string
}

export interface MonthlyParams {
  year?: number | string
  month?: number | string
}

const StatisticsAPI = {
  // 系统概况统计
  getOverview: (params?: OverviewParams) => api.get('/statistics/overview', { params }),

  // 日清统计
  getDaily: (params?: DailyParams) => api.get('/statistics/daily', { params }),

  // 月结统计
  getMonthly: (params?: MonthlyParams) => api.get('/statistics/monthly', { params }),

  // 库存预警
  getInventoryAlerts: () => api.get('/statistics/inventory-alerts'),

  // 销售趋势（按天）
  getSalesTrend: (params: { start_date: string; end_date: string }) => api.get('/statistics/sales-trend', { params }),

  // 分类销售统计
  getSalesByCategory: (params: { start_date: string; end_date: string }) => api.get('/statistics/sales-by-category', { params }),

  // 热销商品 TOP
  getTopProducts: (params: { start_date: string; end_date: string; limit?: number }) => api.get('/statistics/top-products', { params }),

  // 年度月度对比
  getMonthlyComparison: (params: { year?: number }) => api.get('/statistics/monthly-comparison', { params }),

  // 新增：按尺码销量统计
  getSalesBySize: (params: { start_date: string; end_date: string }) => api.get('/statistics/sales-by-size', { params }),

  // 新增：指定商品的尺码销量分布
  getProductSizeSales: (params: { product_id: string | number; start_date?: string; end_date?: string }) => api.get('/statistics/product-size-sales', { params }),

  // 新增：对接真实日清/月结后端接口
  getFinanceDaily: (params: { date: string }) => api.get('/finance/clearing/daily', { params }),
  closeFinanceDaily: (payload: { date: string }) => api.post('/finance/clearing/daily/close', payload),
  getFinanceMonthly: (params: { period: string }) => api.get('/finance/clearing/monthly', { params }),
  closeFinanceMonthly: (payload: { period: string }) => api.post('/finance/clearing/monthly/close', payload),
  exportFinanceMonthly: (params: { period: string }) => api.get('/finance/statements/export', { params, responseType: 'blob' }),

  // 采购趋势（按天）
  getPurchaseTrend: (params: { start_date: string; end_date: string }) => api.get('/statistics/purchase-trend', { params }),

  // 通用 Top 榜：后端暂按现有 top-products，后续可扩展 scope/metric
  getTop: (params: { start_date: string; end_date: string; limit?: number }) => api.get('/statistics/top-products', { params }),

  // 报表导出（后端流式导出CSV/XLSX，当前CSV）
  exportReports: (params: { start_date: string; end_date: string; type: 'overview'|'trend'|'category'|'top'|'size'; format?: 'csv'|'xlsx' }) => api.get('/statistics/export', { params, responseType: 'blob' }),
}

export default StatisticsAPI
