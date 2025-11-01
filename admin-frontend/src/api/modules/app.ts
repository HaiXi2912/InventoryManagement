import api from '../index'

export default {
  // 后端获取路由数据（如后端未实现，可在页面侧做降级处理）
  routeList: () => api.get('/app/route/list', { retry: true }),

  // 基于文件系统路由模式下，后端获取导航菜单数据
  menuList: () => api.get('/app/menu/list', { retry: true }),
}
