const express = require('express');

// 导入路由模块
const authRoutes = require('./auth');
const userRoutes = require('./users');
const productsRoutes = require('./products');
const inventoryRoutes = require('./inventory');
const purchasesRoutes = require('./purchases');
const salesRoutes = require('./sales');
const reportsRoutes = require('./reports');
const productContentRoutes = require('./productContent');
const productMediaRoutes = require('./productMedia');
const productSkusRoutes = require('./productSkus');
const factoryRoutes = require('./factory');

const router = express.Router();

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
      reports: {
        dashboard: 'GET /api/reports/dashboard'
      }
    }
  });
});

// 注册路由
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productsRoutes);
router.use('/products', productContentRoutes);
router.use('/products', productMediaRoutes);
router.use('/products', productSkusRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/purchases', purchasesRoutes); // 历史只读/受限接口
router.use('/sales', salesRoutes);
router.use('/reports', reportsRoutes);
router.use('/factory', factoryRoutes);

module.exports = router;
