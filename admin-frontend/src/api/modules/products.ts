import api from '../index'
import type { ApiResponse } from '../index'

export default {
  // 获取商品列表
  getProductList: (params?: {
    page?: number
    limit?: number
    category?: string
    brand?: string
    status?: string
  }): Promise<ApiResponse<any>> => api.get('/products', { params }) as any,

  // 获取商品详情
  getProduct: (id: string): Promise<ApiResponse<any>> => api.get(`/products/${id}`) as any,

  // 创建商品
  createProduct: (data: any): Promise<ApiResponse<any>> => api.post('/products', data) as any,

  // 更新商品
  updateProduct: (id: string, data: any): Promise<ApiResponse<any>> => api.put(`/products/${id}`, data) as any,

  // 删除商品
  deleteProduct: (id: string): Promise<ApiResponse<any>> => api.delete(`/products/${id}`) as any,

  // 获取商品分类（后端为 /categories/list）
  getCategories: (): Promise<ApiResponse<any>> => api.get('/products/categories/list') as any,

  // 获取商品品牌（后端为 /brands/list）
  getBrands: (): Promise<ApiResponse<any>> => api.get('/products/brands/list') as any,

  // 服装类元数据（分类/尺码/颜色）
  getClothingMeta: (): Promise<ApiResponse<any>> => api.get('/products/catalog/clothing/meta') as any,
}
