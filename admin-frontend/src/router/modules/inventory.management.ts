import type { Route } from '#/global'

const inventoryModule: Route.recordMainRaw = {
  meta: {
    title: '进销存管理',
    icon: 'i-ep:goods',
  },
  children: [
    {
      path: '/inventory/dashboard',
      component: () => import('@/views/inventory/dashboard.vue'),
      meta: {
        title: '仪表板',
        icon: 'i-ep:data-line',
      },
    },
    {
      path: '/inventory/products',
      component: () => import('@/views/inventory/products.vue'),
      meta: {
        title: '商品管理',
        icon: 'i-ep:goods',
      },
    },
    {
      path: '/inventory/purchases',
      component: () => import('@/views/inventory/purchases.vue'),
      meta: {
        title: '进货管理',
        icon: 'i-ep:shopping-cart-full',
      },
    },
    {
      path: '/inventory/sales',
      component: () => import('@/views/inventory/sales.vue'),
      meta: {
        title: '销售管理',
        icon: 'i-ep:sell',
      },
    },
    {
      path: '/inventory/inventory',
      component: () => import('@/views/inventory/inventory.vue'),
      meta: {
        title: '库存查询',
        icon: 'i-ep:box',
      },
    },
    {
      path: '/inventory/reports',
      component: () => import('@/views/inventory/reports.vue'),
      meta: {
        title: '统计报表',
        icon: 'i-ep:data-analysis',
      },
    },
    {
      path: '/inventory/settlement',
      component: () => import('@/views/inventory/settlement.vue'),
      meta: {
        title: '日清月结',
        icon: 'i-ep:calendar',
      },
    },
  ],
}

export default inventoryModule
