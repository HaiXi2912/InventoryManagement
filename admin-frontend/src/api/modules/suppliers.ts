import api from '../index'
import type { ApiResponse } from '../index'

export default {
  // 供应商功能已下线，调用将返回404
  getList: (_params?: any): Promise<ApiResponse<any>> => api.get('/suppliers') as any,
}
