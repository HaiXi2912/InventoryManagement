const express = require('express');

// 导入路由模块
const authRoutes = require('./auth');
const userRoutes = require('./users');
const productsRoutes = require('./products');
const inventoryRoutes = require('./inventory');
const purchasesRoutes = require('./purchases');
const salesRoutes = require('./sales');
// const reportsRoutes = require('./reports'); // 该文件当前不存在，改为可选加载
const productContentRoutes = require('./productContent');
const productMediaRoutes = require('./productMedia');
const productSkusRoutes = require('./productSkus');
const factoryRoutes = require('./factory');
// 新增：商城目录公开接口（无鉴权，用于前台）
let catalogRoutes = null;
try {
  catalogRoutes = require('./catalog');
} catch (e) {
  catalogRoutes = null;
}

const router = express.Router();

// 轻量健康检查（用于确认 /api 是否挂载）
router.get('/_ping', (req, res) => res.json({ ok: true, t: Date.now() }));

// API版本信息
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: '服装网店进销存系统 API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        logout: 'POST /api/auth/logout',
        profile: 'GET /api/auth/profile',
        updateProfile: 'PUT /api/auth/profile',
        changePassword: 'PUT /api/auth/password'
      },
      users: {
        list: 'GET /api/users',
        get: 'GET /api/users/:id',
        create: 'POST /api/users',
        update: 'PUT /api/users/:id',
        delete: 'DELETE /api/users/:id',
        resetPassword: 'PUT /api/users/:id/reset-password'
      },
      products: {
        list: 'GET /api/products',
        get: 'GET /api/products/:id',
        create: 'POST /api/products',
        update: 'PUT /api/products/:id',
        delete: 'DELETE /api/products/:id'
      },
      inventory: {
        list: 'GET /api/inventory',
        get: 'GET /api/inventory/:id',
        adjust: 'POST /api/inventory/adjust'
      },
      factory: {
        list: 'GET /api/factory/orders',
        create: 'POST /api/factory/orders',
        approve: 'POST /api/factory/orders/:id/approve',
        start: 'POST /api/factory/orders/:id/start',
        complete: 'POST /api/factory/orders/:id/complete',
        ship: 'POST /api/factory/orders/:id/ship',
        cancel: 'POST /api/factory/orders/:id/cancel'
      },
      sales: {
        list: 'GET /api/sales',
        get: 'GET /api/sales/:id',
        create: 'POST /api/sales',
        update: 'PUT /api/sales/:id',
        delete: 'DELETE /api/sales/:id'
      },
      // reports: { dashboard: 'GET /api/reports/dashboard' } // 可选
    }
  });
});

// 注册路由（将 products 相关放在前，以匹配 /api/products/*）
router.use('/products', productsRoutes);
router.use('/products', productContentRoutes);
router.use('/products', productMediaRoutes);
router.use('/products', productSkusRoutes);
// 新增：前台目录（公开）
if (catalogRoutes) router.use('/catalog', catalogRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/purchases', purchasesRoutes); // 历史只读/受限接口
router.use('/sales', salesRoutes);
// 可选挂载 reports（如果存在）
try {
  const reportsRoutes = require('./reports');
  router.use('/reports', reportsRoutes);
} catch (e) {
  // 忽略缺失
}
router.use('/factory', factoryRoutes);

module.exports = router;
