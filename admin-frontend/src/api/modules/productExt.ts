import api from '../index'
import type { ApiResponse } from '../index'

// 商品扩展（富文本/媒体/SKU）相关 API
export interface ProductContentPayload {
  rich_html?: string
  mobile_html?: string
  seo_title?: string
  seo_keywords?: string
  seo_desc?: string
}

export interface ProductMediaPayload {
  url: string
  type?: 'image' | 'video'
  thumb_url?: string
  sort?: number
  is_main?: boolean
}

export interface ProductSkuPayload {
  size: string
  color?: string
  barcode: string
  retail_price?: number
  tag_price?: number
  cost_price?: number
  stock?: number
  sort?: number
  status?: 'active' | 'disabled'
}

export default {
  // -------- 内容 --------
  getContent: (productId: string|number): Promise<ApiResponse<any>> => api.get(`/products/${productId}/content`) as any,
  saveContent: (productId: string|number, data: ProductContentPayload): Promise<ApiResponse<any>> => api.post(`/products/${productId}/content`, data) as any,

  // -------- 媒体 --------
  listMedia: (productId: string|number): Promise<ApiResponse<any>> => api.get(`/products/${productId}/media`) as any,
  createMedia: (productId: string|number, data: ProductMediaPayload): Promise<ApiResponse<any>> => api.post(`/products/${productId}/media`, data) as any,
  uploadMedia: (productId: string|number, file: File): Promise<ApiResponse<any>> => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/products/${productId}/media/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } }) as any
  },
  updateMedia: (mediaId: string|number, data: Partial<ProductMediaPayload>): Promise<ApiResponse<any>> => api.put(`/products/media/${mediaId}`, data) as any,
  deleteMedia: (mediaId: string|number): Promise<ApiResponse<any>> => api.delete(`/products/media/${mediaId}`) as any,

  // -------- SKU --------
  listSkus: (productId: string|number): Promise<ApiResponse<any>> => api.get(`/products/${productId}/skus`) as any,
  listSkuStocks: (productId: string|number): Promise<ApiResponse<any>> => api.get(`/products/${productId}/sku-stocks`) as any,
  batchCreateSkus: (productId: string|number, items: ProductSkuPayload[]): Promise<ApiResponse<any>> => api.post(`/products/${productId}/skus/batch`, items) as any,
  batchCreateSkusBySize: (productId: string|number, payload: { template?: 'apparel'|'full'|'kids'|'one'; baseBarcode?: string; prefix?: string; sizes?: string[]; retail_price?: number; stock?: number }): Promise<ApiResponse<any>> =>
    api.post(`/products/${productId}/skus/batch-by-size`, payload) as any,
  copySkusFrom: (productId: string|number, sourceProductId: string|number, payload?: { barcodePrefix?: string; keepBarcode?: boolean }): Promise<ApiResponse<any>> =>
    api.post(`/products/${productId}/skus/copy-from/${sourceProductId}`, payload || {}) as any,
  updateSku: (skuId: string|number, data: Partial<ProductSkuPayload>): Promise<ApiResponse<any>> => api.put(`/products/skus/${skuId}`, data) as any,
  updateSkuStatus: (skuId: string|number, status: 'active'|'disabled'): Promise<ApiResponse<any>> => api.patch(`/products/skus/${skuId}/status`, { status }) as any,
  checkSkuBarcode: (barcode: string): Promise<ApiResponse<any>> => api.get('/products/skus/check-barcode', { params: { barcode } }) as any,
  deleteSku: (skuId: string|number): Promise<ApiResponse<any>> => api.delete(`/products/skus/${skuId}`) as any,
  // 新增：批量保存阈值/目标
  saveReorderConfig: (productId: string|number, items: Array<{ id: number|string; reorder_threshold?: number|null; reorder_target?: number|null }>): Promise<ApiResponse<any>> =>
    api.post(`/products/${productId}/skus/reorder-config`, items) as any,
}
