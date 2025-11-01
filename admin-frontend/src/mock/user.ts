import { defineFakeRoute } from 'vite-plugin-fake-server/client'

// 已切换到真实后端鉴权，禁用用户相关 mock 接口
export default defineFakeRoute([])
