const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
require('dotenv').config();

const HOST = process.env.HOST || '0.0.0.0';
const isDev = (process.env.NODE_ENV || 'development') !== 'production';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 通用 API 兼容重写：将无 /api 前缀的旧路径自动加上 /api
const apiRoots = ['/auth','/users','/products','/inventory','/purchases','/sales','/statistics','/returns','/factory','/finance','/stock','/addresses','/customers','/orders','/chats','/catalog','/reports'];
app.use((req, _res, next) => {
  try {
    const p = req.path || req.url || '';
    const hit = apiRoots.find(r => p.startsWith(r + '/') || p === r);
    if (hit && !p.startsWith('/api/')) {
      req.url = '/api' + req.url; // 保留查询串
    }
  } catch {}
  return next();
});

// 开发跨域（允许本机端口 5173/5174 等前端直接请求 3000）
app.use((req, res, next) => {
  try {
    const origin = req.headers.origin || '*';
    // 仅开发环境放宽，生产可按需收敛
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  } catch {}
  return next();
});

// 放宽 Content-Security-Policy（同源静态与 XHR）
app.use((req, res, next) => {
  try {
    const origin = req.headers.origin || `http://${req.headers.host || 'localhost:3000'}`;
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'self';");
  } catch {}
  return next();
});

// 记录实际监听端口（避免 env.PORT 造成混淆）
let __actualPort = null;

// 诊断：当前进程信息
app.get('/__whoami', (_req, res) => {
  res.json({
    entry: 'newserver.js',
    pid: process.pid,
    cwd: process.cwd(),
    file: __filename,
    env: { PORT: process.env.PORT, HOST: process.env.HOST, NODE_ENV: process.env.NODE_ENV },
    actualPort: __actualPort,
    t: Date.now()
  });
});

// 路由列表（调试）
app.get('/__routes', (_req, res) => {
  try {
    const routes = [];
    const walk = (stack, prefix = '') => {
      for (const layer of stack) {
        if (layer.route && layer.route.path) {
          routes.push({ path: prefix + layer.route.path, methods: Object.keys(layer.route.methods) });
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
          const m = String(layer.regexp).match(/\^\\\/(.*?)\\\/?\?\$/);
          const sub = m && m[1] ? '/' + m[1] : '';
          walk(layer.handle.stack, prefix + sub);
        }
      }
    };
    if (app && app._router && app._router.stack) walk(app._router.stack, '');
    res.json({ ok: true, count: routes.length, routes });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 存活探针（优先）
app.get('/api/_ping', (_req, res) => {
  res.json({ ok: true, t: Date.now() });
});

// 数据库健康检查
const { testConnection } = require('./config/database');
app.get('/api/health', async (_req, res) => {
  try {
    const db = await testConnection();
    res.json({ ok: true, db: db ? 'connected' : 'disconnected', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'error', error: e.message });
  }
});

// 兼容：将未加 /api 前缀的接口重写到 /api，避免 404（例如 /statistics/* -> /api/statistics/*）
const __apiFallbackPrefixes = [
  '/statistics', '/addresses', '/afterSales', '/auth', '/catalog', '/chats',
  '/customers', '/factory', '/finance', '/inventory', '/logs', '/orders',
  '/print', '/productContent', '/productMedia', '/products', '/productSkus',
  '/purchases', '/returns', '/sales', '/stock', '/suppliers', '/transfers', '/users', '/_ping'
];
app.use((req, _res, next) => {
  try {
    const p = req.path || '';
    if (__apiFallbackPrefixes.some(x => p.startsWith(x))) {
      req.url = '/api' + req.url; // 重写为带前缀
    }
  } catch {}
  return next();
});

// 兼容从 /admin/* 或 /shop/* 发起的相对 API 调用（例如 /admin/auth/login -> /api/auth/login）
app.use((req, _res, next) => {
  try {
    const p = req.path || '';
    const q = req.url.slice(p.length) || '';
    for (const base of ['/admin', '/shop']) {
      if (p.startsWith(base + '/')) {
        const rest = p.slice(base.length); // 以 / 开头
        const hit = apiRoots.find(r => rest.startsWith(r + '/') || rest === r);
        if (hit) {
          req.url = '/api' + rest + q;
          break;
        }
      }
    }
  } catch {}
  return next();
});

// 显式重写：/auth/* -> /api/auth/*（避免偶发未命中）
app.all('/auth/*', (req, _res, next) => { try { if (!req.path.startsWith('/api/')) req.url = '/api' + req.url; } catch {} return next(); });

// 挂载真实 API 路由
try {
  const apiRouter = require('./routes');
  // 保留原有前缀
  app.use('/api', apiRouter);
  console.log('✅ 已挂载真实 API 路由 (/api)');
  // 移除将 API 路由挂载到根路径，避免拦截 SPA 路由与静态资源
  // app.use('/', apiRouter);
  // console.log('✅ 已挂载兼容 API 路由 (/)');
  // 兼容直达统计路径
  try { const statsRouter = require('./routes/statistics'); app.use('/statistics', statsRouter); console.log('✅ 已兼容直达统计路由 (/statistics)'); } catch {}
  // 兼容直达产品路径
  try { const productsRouter = require('./routes/products'); app.use('/products', productsRouter); console.log('✅ 已兼容直达产品路由 (/products)'); } catch {}
  // 兼容直达鉴权路径
  try { const authRouter = require('./routes/auth'); app.use('/auth', authRouter); console.log('✅ 已兼容直达鉴权路由 (/auth)'); } catch {}
} catch (e) {
  console.warn('⚠️ 挂载真实 API 路由失败，检查 ./routes 是否完整：', e.message);
}

// Health
app.get('/health', (_req, res) => res.status(200).send('OK'));

// 静态资源
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

// 优先从 public/admin 与 public/shop 提供构建产物
const adminPub = path.join(publicDir, 'admin');
const shopPub  = path.join(publicDir, 'shop');

// 预压缩资源兜底（优先处理绝对路径 /assets 与 /browser_upgrade 的 .br/.gz 文件）
(function setupPrecompressedStatic() {
  const exts = ['js','css','svg','html','json','map','png','jpg','jpeg','webp','ico','woff','woff2','ttf'];
  const mimeMap = {
    js: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    html: 'text/html; charset=utf-8',
    svg: 'image/svg+xml',
    json: 'application/json; charset=utf-8',
    map: 'application/json; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf'
  };
  const getMime = (p) => {
    const m = (p.split('.').pop() || '').toLowerCase();
    return mimeMap[m] || 'application/octet-stream';
  };
  app.use((req, res, next) => {
    try {
      if (req.method !== 'GET') return next();
      const u = decodeURI(req.path || req.url || '');
      const ok = exts.some(ext => u.toLowerCase().endsWith('.' + ext));
      if (!ok) return next();
      const rel = u.startsWith('/') ? u.slice(1) : u;
      const bases = [adminPub, shopPub, publicDir].filter(Boolean);
      for (const base of bases) {
        if (!base || !fs.existsSync(base)) continue;
        const abs = path.join(base, rel);
        // 原文件
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          res.type(getMime(abs));
          return res.sendFile(abs);
        }
        // brotli
        if (fs.existsSync(abs + '.br')) {
          res.set('Content-Encoding', 'br');
          res.type(getMime(abs));
          return res.sendFile(abs + '.br');
        }
        // gzip
        if (fs.existsSync(abs + '.gz')) {
          res.set('Content-Encoding', 'gzip');
          res.type(getMime(abs));
          return res.sendFile(abs + '.gz');
        }
      }
    } catch {}
    return next();
  });
})();

// Admin 前端
if (fs.existsSync(adminPub)) {
  app.use('/admin', express.static(adminPub));
  const adminIndexHtml = path.join(adminPub, 'index.html');
  const adminTest = path.join(adminPub, 'api-test.html');
  app.get(['/admin', '/admin/*'], (_req, res) => {
    if (fs.existsSync(adminIndexHtml)) return res.sendFile(adminIndexHtml);
    if (fs.existsSync(adminTest)) return res.sendFile(adminTest);
    return res.status(404).type('text/plain').send('管理后台未构建');
  });
} else {
  // 兼容旧结构 admin-frontend/dist
  const adminDist = path.join(__dirname, 'admin-frontend', 'dist');
  if (fs.existsSync(adminDist)) {
    app.use('/admin', express.static(adminDist));
    const adminIndex = path.join(adminDist, 'index.html');
    if (fs.existsSync(adminIndex)) app.get(['/admin', '/admin/*'], (_req, res) => res.sendFile(adminIndex));
  }
}

// Shop 前端
if (fs.existsSync(shopPub)) {
  app.use('/shop', express.static(shopPub));
  const shopIndexHtml = path.join(shopPub, 'index.html');
  app.get(['/shop', '/shop/*'], (_req, res) => {
    if (fs.existsSync(shopIndexHtml)) return res.sendFile(shopIndexHtml);
    return res.status(404).type('text/plain').send('商城前台未构建');
  });
} else {
  // 兼容旧结构 shop-frontend/dist
  const shopDist = path.join(__dirname, 'shop-frontend', 'dist');
  if (fs.existsSync(shopDist)) {
    app.use('/shop', express.static(shopDist));
    const shopIndex = path.join(shopDist, 'index.html');
    if (fs.existsSync(shopIndex)) app.get(['/shop', '/shop/*'], (_req, res) => res.sendFile(shopIndex));
  }
}

// 追加根路径资源映射：处理 index.html 中以绝对路径引用的资源（/assets、/browser_upgrade 等）
try {
  const adminAssets = path.join(adminPub, 'assets');
  const shopAssets  = path.join(shopPub, 'assets');
  const adminUpgrade = path.join(adminPub, 'browser_upgrade');
  if (fs.existsSync(adminAssets)) app.use('/assets', express.static(adminAssets));
  if (fs.existsSync(shopAssets))  app.use('/assets', express.static(shopAssets));
  if (fs.existsSync(adminUpgrade)) app.use('/browser_upgrade', express.static(adminUpgrade));
  // favicon 兜底
  app.get('/favicon.svg', (req, res, next) => {
    const fav1 = path.join(adminPub, 'favicon.svg');
    const fav2 = path.join(shopPub, 'favicon.svg');
    if (fs.existsSync(fav1)) return res.sendFile(fav1);
    if (fs.existsSync(fav2)) return res.sendFile(fav2);
    return next();
  });
} catch {}

// 开发模式重定向至 Vite
if (isDev) {
  app.use((req, res, next) => {
    const h = req.headers.host || '';
    const p = req.path || req.url || '';
    if (p.startsWith('/admin') && !p.startsWith('/admin-static')) {
      if (!h.endsWith(':9000')) return res.redirect(302, 'http://localhost:9000/');
    } else if (p.startsWith('/shop') && !p.startsWith('/shop-static')) {
      if (!h.endsWith(':5173')) return res.redirect(302, 'http://localhost:5173/');
    }
    return next();
  });
}

// 简单首页
app.get('/', (req, res, next) => {
  const indexHtml = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexHtml)) return next();
  res.type('html').send('<h1>newserver.js @ 3000</h1><p><a href="/admin">/admin</a> | <a href="/shop">/shop</a></p>');
});

// 端口探测
async function findAvailablePort(startPort, maxTries = 20, host = HOST) {
  return await new Promise((resolve) => {
    const tryPort = (p, triesLeft) => {
      const tester = net.createServer()
        .once('error', (err) => {
          if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && triesLeft > 0) {
            tryPort(p + 1, triesLeft - 1);
          } else {
            resolve(null);
          }
        })
        .once('listening', () => {
          tester.close(() => resolve(p));
        })
        .listen(p, host);
    };
    tryPort(startPort, maxTries);
  });
}

(async () => {
  // 优先命令行参数，其次环境变量，最后默认 3000
  const argvPort = Number(process.argv[2]);
  const envPort = Number(process.env.PORT);
  const desired = (Number.isFinite(argvPort) && argvPort > 0)
    ? argvPort
    : ((Number.isFinite(envPort) && envPort > 0) ? envPort : 3000);
  const source = (Number.isFinite(argvPort) && argvPort > 0)
    ? 'argv'
    : ((Number.isFinite(envPort) && envPort > 0) ? 'env' : 'default');

  const free = await findAvailablePort(desired, 50, HOST);
  const chosen = free ?? 0;
  if (chosen <= 0) {
    console.error('❌ 未能找到可用端口，服务启动失败');
    process.exit(1);
  }

  // 记录实际监听端口
  __actualPort = chosen;
  app.set('port', chosen);

  // 启动服务
  const server = app.listen(chosen, HOST, () => {
    const addr = server.address();
    const host = addr.address === '::' ? 'localhost' : addr.address;
    console.log(`\n✅ 服务已启动： http://${host}:${addr.port}`);
    console.log(`- 环境：${process.env.NODE_ENV}`);
    console.log(`- 版本：${require('./package.json').version}`);
    console.log(`- 目录：${process.cwd()}`);
    console.log(`- PID：${process.pid}`);
    console.log(`- 启动时间：${new Date().toISOString()}`);
  });

  // 强制关闭
  process.on('SIGTERM', () => {
    console.log('🚀 收到停机信号，正在关闭服务...');
    server.close(() => {
      console.log('✅ 服务已关闭');
      process.exit(0);
    });
  });
  process.on('SIGINT', () => {
    console.log('🚀 收到中断信号，正在关闭服务...');
    server.close(() => {
      console.log('✅ 服务已关闭');
      process.exit(0);
    });
  });
})();

// 兜底重写：若仍访问直达 API 且未被命中，做 307 重定向到 /api 前缀，保留方法与请求体
app.use((req, res, next) => {
  try {
    const p = req.path || '';
    const hit = apiRoots.find(r => p.startsWith(r + '/') || p === r);
    if (hit && !p.startsWith('/api/')) {
      const target = '/api' + req.url;
      // 控制台调试
      console.warn(`[rewrite-307] ${req.method} ${req.url} -> ${target}`);
      return res.redirect(307, target);
    }
  } catch {}
  return next();
});
