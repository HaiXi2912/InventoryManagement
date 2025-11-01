const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { testConnection } = require('./config/database');
const net = require('net');
require('dotenv').config();

// 保证 JWT_SECRET 在开发环境有默认值，签名与校验一致
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const app = express();
// 将默认端口从 3001 调整为 3004，便于与前台代理保持一致
const PORT = process.env.PORT || 3004;

// 引入认证路由
const authRouter = require('./routes/auth');
const productsRouter = require('./routes/products');
const inventoryRouter = require('./routes/inventory');
const purchasesRouter = require('./routes/purchases');
const salesRouter = require('./routes/sales');
const statisticsRouter = require('./routes/statistics');
const usersRouter = require('./routes/users');
const logsRouter = require('./routes/logs');
const returnsRouter = require('./routes/returns');
const transfersRouter = require('./routes/transfers');
// const suppliersRouter = require('./routes/suppliers');
const productContentRouter = require('./routes/productContent');
const productMediaRouter = require('./routes/productMedia');
const productSkusRouter = require('./routes/productSkus');
const ordersRouter = require('./routes/orders');
const addressesRouter = require('./routes/addresses');
const customersRouter = require('./routes/customers');
const afterSalesRouter = require('./routes/afterSales');
const chatsRouter = require('./routes/chats');
const stockRouter = require('./routes/stock');
const printRouter = require('./routes/print');
const factoryRouter = require('./routes/factory');
// 新增：财务（日清/月结）
const financeRouter = require('./routes/finance');

// 订阅库存事件总线，触发自动补货
const { stockBus } = require('./services/stockBus');
const { checkAndReplenishBySkus } = require('./services/autoReplenish');

const { requestLogger, errorHandler, notFound } = require('./middleware/validation');

// 安全中间件
app.use(helmet());

// CORS配置
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? ['http://localhost:3000'] : '*',
  credentials: true
}));

// 限流配置（生产环境启用，开发环境关闭）
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: '请求过于频繁，请稍后再试'
});
if (process.env.NODE_ENV === 'production') {
  app.use(limiter);
} else {
  console.log('⚙️ 开发环境：已禁用全局限流（express-rate-limit）');
}

// 解析JSON和URL编码的请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 通用请求日志
app.use(requestLogger);

// 静态文件服务
app.use('/static', express.static('public'));
app.use(express.static('public'));

// 健康检查接口
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: dbStatus ? 'connected' : 'disconnected',
      version: '1.0.0'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error.message
    });
  }
});

// API路由
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/sales', salesRouter);
app.use('/api/statistics', statisticsRouter);
app.use('/api/users', usersRouter);
app.use('/api/logs', logsRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/transfers', transfersRouter);
// app.use('/api/suppliers', suppliersRouter);
// 修正挂载前缀，限定在 /api/products 下
app.use('/api/products', productContentRouter); // /api/products/:productId/content
app.use('/api/products', productMediaRouter);   // /api/products/:productId/media
app.use('/api/products', productSkusRouter);    // /api/products/:productId/skus
app.use('/api', ordersRouter);         // /api/catalog, /api/orders
app.use('/api/addresses', addressesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/after-sales', afterSalesRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/stock', stockRouter);
app.use('/api/print', printRouter);
app.use('/api/factory', factoryRouter);
// 新增：财务接口
app.use('/api/finance', financeRouter);

// 监听库存变动，统一触发自动补货（非阻塞）
stockBus.on('stockChanged', async (affected, ctx) => {
  try {
    await checkAndReplenishBySkus(Array.isArray(affected) ? affected : [], {
      operatorId: ctx?.operatorId || null,
      reasonRemark: ctx?.reason || '库存变动触发自动补货'
    });
  } catch (e) {
    console.error('stockChanged 自动补货失败:', e);
  }
});

// 404处理
app.use('*', notFound);

// 全局错误处理
app.use(errorHandler);

// 启动服务器
const startServer = async () => {
  try {
    // 测试数据库连接
    console.log('🔍 检查数据库连接...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ 数据库连接失败，请检查配置');
      console.log('💡 提示：请先运行 npm run db:init 初始化数据库');
      process.exit(1);
    }

    // 自动探测可用端口（从环境端口或3004开始，最多尝试10个）
    const prefer = Number(process.env.PORT) || 3004;
    const availablePort = await new Promise((resolve) => {
      let port = prefer;
      let tries = 0;
      const tryNext = () => {
        if (tries >= 10) return resolve(prefer); // 兜底仍返回首选端口（可能继续报错）
        const tester = net.createServer()
          .once('error', (err) => {
            if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
              port += 1; tries += 1; tester.close(); tryNext();
            } else {
              resolve(port);
            }
          })
          .once('listening', () => {
            tester.close(() => resolve(port));
          })
          .listen(port);
      };
      tryNext();
    });

    const server = app.listen(availablePort, () => {
      console.log('🚀 服务器启动成功！');
      console.log(`📍 服务地址: http://localhost:${availablePort}`);
      console.log(`🔍 健康检查: http://localhost:${availablePort}/health`);
      console.log(`📚 API文档: http://localhost:${availablePort}/api`);
      console.log(`🌍 运行环境: ${process.env.NODE_ENV || 'development'}`);
      console.log('✨ 服装网店进销存系统已就绪！');
      if (availablePort !== (Number(process.env.PORT) || 3004)) {
        console.log(`⚠️ 端口 ${Number(process.env.PORT) || 3004} 被占用，已自动切换到端口 ${availablePort}`);
      }
    });

    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(`❌ 端口被占用: ${availablePort}`);
        console.error('请结束占用进程或设置环境变量 PORT 以使用其他端口');
      } else {
        console.error('❌ 服务器错误:', err);
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error('❌ 服务器启动失败:', error.message);
    process.exit(1);
  }
};

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('🔄 接收到 SIGTERM 信号，正在优雅关闭...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 接收到 SIGINT 信号，正在优雅关闭...');
  process.exit(0);
});

// 仅在直接运行时启动服务器，测试环境导入不启动
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
