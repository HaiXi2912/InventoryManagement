import type { Route } from '#/global'
import type { RouteRecordRaw } from 'vue-router'
import generatedRoutes from 'virtual:generated-pages'
import { setupLayouts } from 'virtual:meta-layouts'

// 固定路由（默认路由）
const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/login.vue'),
    meta: {
      title: '用户登录',
    },
  },
  {
    path: '/:all(.*)*',
    name: 'notFound',
    component: () => import('@/views/[...all].vue'),
    meta: {
      title: '找不到页面',
    },
  },
]

// 系统路由
const systemRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/index.vue'),
    redirect: '/dashboard',
    meta: {
      title: () => useSettingsStore().settings.home.title,
      breadcrumb: false,
    },
    children: [
      {
        path: 'reload',
        name: 'reload',
        component: () => import('@/views/reload.vue'),
        meta: {
          title: '重新加载',
          breadcrumb: false,
        },
      },
    ],
  },
]

// 动态路由（异步路由、导航栏路由）
const asyncRoutes: Route.recordMainRaw[] = [
  {
    meta: {
      title: '商品',
      icon: 'i-ep:goods',
    },
    children: [
      {
        path: '/products',
        component: () => import('@/layouts/index.vue'),
        redirect: '/products/list',
        meta: {
          title: '商品管理',
          icon: 'i-ep:goods',
        },
        children: [
          {
            path: 'list',
            name: 'productsList',
            component: () => import('@/views/inventory/products.vue'),
            meta: {
              title: '商品列表',
              icon: 'i-ep:list',
            },
          },
        ],
      },
    ],
  },
  {
    meta: {
      title: '进销',
      icon: 'i-ep:shop',
    },
    children: [
      {
        path: '/purchases',
        component: () => import('@/layouts/index.vue'),
        redirect: '/purchases/list',
        meta: {
          title: '进货管理',
          icon: 'i-ep:shopping-cart-full',
        },
        children: [
          {
            path: 'list',
            name: 'purchasesList',
            component: () => import('@/views/inventory/purchases.vue'),
            meta: {
              title: '进货单据',
              icon: 'i-ep:document-add',
            },
          },
        ],
      },
      {
        path: '/sales',
        component: () => import('@/layouts/index.vue'),
        redirect: '/sales/list',
        meta: { title: '销售管理', icon: 'ep:sell', enabled: true },
        children: [
          {
            path: 'list',
            name: 'salesList',
            component: () => import('@/views/inventory/sales.vue'),
            meta: { title: '销售单', keepAlive: false },
          },
        ],
      },
    ],
  },
  {
    meta: { title: '工厂', icon: 'i-ep:office-building' },
    children: [
      {
        path: '/factory',
        component: () => import('@/layouts/index.vue'),
        redirect: '/factory/dashboard',
        meta: { title: '工厂中心', icon: 'i-ep:office-building' },
        children: [
          { path: 'dashboard', name: 'factoryDashboard', component: () => import('@/views/factory/index.vue'), meta: { title: '工厂看板' } },
          { path: 'orders', name: 'factoryOrders', component: () => import('@/views/factory/orders.vue'), meta: { title: '工厂订单' } },
        ],
      },
    ],
  },
  {
    meta: {
      title: '库存',
      icon: 'i-ep:box',
    },
    children: [
      {
        path: '/inventory',
        component: () => import('@/layouts/index.vue'),
        redirect: '/inventory/query',
        meta: {
          title: '库存查询',
          icon: 'i-ep:search',
        },
        children: [
          {
            path: 'query',
            name: 'inventoryQuery',
            component: () => import('@/views/inventory/inventory.vue'),
            meta: {
              title: '库存查询',
              icon: 'i-ep:search',
            },
          },
        ],
      },
    ],
  },
  {
    meta: {
      title: '统计',
      icon: 'i-ep:data-analysis',
    },
    children: [
      {
        path: '/reports',
        component: () => import('@/layouts/index.vue'),
        redirect: '/reports/dashboard',
        meta: {
          title: '统计报表',
          icon: 'i-ep:data-line',
        },
        children: [
          {
            path: 'dashboard',
            name: 'reportsDashboard',
            component: () => import('@/views/inventory/reports.vue'),
            meta: {
              title: '数据报表',
              icon: 'i-ep:data-line',
            },
          },
        ],
      },
      {
        path: '/settlement',
        component: () => import('@/layouts/index.vue'),
        redirect: '/settlement/daily',
        meta: {
          title: '日清月结',
          icon: 'i-ep:calendar',
        },
        children: [
          {
            path: 'daily',
            name: 'settlementDaily',
            component: () => import('@/views/inventory/settlement.vue'),
            meta: {
              title: '日清月结',
              icon: 'i-ep:calendar',
            },
          },
          {
            path: 'factory',
            name: 'factorySettlement',
            component: () => import('@/views/finance/factory-settlement.vue'),
            meta: {
              title: '工厂结算',
              icon: 'i-ep:coin',
            },
          },
        ],
      },
    ],
  },
  {
    meta: {
      title: '工作台',
      icon: 'i-ep:monitor',
    },
    children: [
      {
        path: '/',
        component: () => import('@/layouts/index.vue'),
        redirect: '/dashboard',
        meta: {
          title: '工作台',
          icon: 'i-ep:monitor',
        },
        children: [
          {
            path: 'dashboard',
            name: 'dashboard',
            component: () => import('@/views/inventory/dashboard.vue'),
            meta: {
              title: '数据看板',
              icon: 'i-ep:data-board',
            },
          },
        ],
      },
    ],
  },
  {
    meta: {
      title: '客服',
      icon: 'i-ep:chat-line-square',
    },
    children: [
      {
        path: '/cs',
        component: () => import('@/layouts/index.vue'),
        redirect: '/cs/workbench',
        meta: {
          title: '客服中心',
          icon: 'i-ep:chat-line-square',
        },
        children: [
          {
            path: 'workbench',
            name: 'csWorkbench',
            component: () => import('@/views/customer-service/workbench.vue'),
            meta: {
              title: '客服工作台',
              icon: 'i-ep:customer-service',
            },
          },
          {
            path: 'me',
            name: 'csMyProfile',
            component: () => import('@/views/customer-service/my-profile.vue'),
            meta: {
              title: '我的资料',
              icon: 'i-ep:user',
            },
          },
          {
            path: 'after-sale-detail',
            name: 'afterSaleDetail',
            component: () => import('@/views/after-sales/detail.vue'),
            meta: {
              title: '售后详情',
              icon: 'i-ep:refresh-right',
            },
          },
        ],
      },
    ],
  },
  {
    meta: {
      title: '平台',
      icon: 'i-ep:user',
    },
    children: [
      {
        path: '/system',
        component: () => import('@/layouts/index.vue'),
        redirect: '/system/members',
        meta: { title: '平台', icon: 'i-ep:user' },
        children: [
          {
            path: 'members',
            name: 'systemMembers',
            component: () => import('@/views/system/members.vue'),
            meta: { title: '平台成员', icon: 'i-ep:user-filled' },
          },
          {
            path: 'customers',
            name: 'systemCustomers',
            component: () => import('@/views/system/customers.vue'),
            meta: { title: '散户用户', icon: 'i-ep:user' },
          },
        ],
      },
    ],
  },
  {
    meta: {
      title: '订单',
      icon: 'i-ep:document',
    },
    children: [
      {
        path: '/orders',
        component: () => import('@/layouts/index.vue'),
        redirect: '/orders/admin',
        meta: { title: '订单', icon: 'i-ep:document' },
        children: [
          { path: 'admin', name: 'adminOrders', component: () => import('@/views/orders/admin-orders.vue'), meta: { title: '订单管理', icon: 'i-ep:ship' } },
          { path: 'detail', name: 'adminOrderDetail', component: () => import('@/views/orders/admin-order-detail.vue'), meta: { title: '订单详情', icon: 'i-ep:document', breadcrumb: true, hidden: true } },
        ],
      },
    ],
  },
]

const constantRoutesByFilesystem = generatedRoutes.filter((item) => {
  return item.meta?.enabled !== false && item.meta?.constant === true
})

const asyncRoutesByFilesystem = setupLayouts(generatedRoutes.filter((item) => {
  return item.meta?.enabled !== false && item.meta?.constant !== true && item.meta?.layout !== false
}))

export {
  asyncRoutes,
  asyncRoutesByFilesystem,
  constantRoutes,
  constantRoutesByFilesystem,
  systemRoutes,
}
