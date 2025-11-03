const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
require('dotenv').config();

const HOST = process.env.HOST || '0.0.0.0';
const isDev = (process.env.NODE_ENV || 'development') !== 'production';

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 诊断端点：查看当前进程、工作目录、加载文件
app.get('/__whoami', (_req, res) => {
  res.json({
    pid: process.pid,
    cwd: process.cwd(),
    file: __filename,
    env: { PORT: process.env.PORT, HOST: process.env.HOST, NODE_ENV: process.env.NODE_ENV },
    t: Date.now()
  });
});

// 诊断端点：列出已注册路由（仅调试用途）
app.get('/__routes', (_req, res) => {
  try {
    const routes = [];
    const walk = (stack, prefix = '') => {
      for (const layer of stack) {
        if (layer.route && layer.route.path) {
          routes.push({ path: prefix + layer.route.path, methods: Object.keys(layer.route.methods) });
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
          const p = layer.regexp && layer.regexp.fast_star ? '*' : (layer.regexp && layer.regexp.source) || '';
          // 尝试从正则里推断前缀（简化显示）
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

// 立即提供 /api/_ping 探针（优先于任何其他中间件），用于确认 /api 前缀是否可达
app.get('/api/_ping', (req, res) => {
  res.json({ ok: true, t: Date.now() });
});

// 接入真实数据库健康检查
const { testConnection } = require('./config/database');

// 替换：API 健康检查，返回数据库连通性
app.get('/api/health', async (_req, res) => {
  try {
    const db = await testConnection();
    res.json({ ok: true, db: db ? 'connected' : 'disconnected', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'error', error: e.message });
  }
});

// 移除占位版本的统计概览与 /api/* 兜底（接入真实路由）

// 挂载真实 API 路由（recovery 已恢复到 ./routes，并包含 index.js 聚合）
try {
  const apiRouter = require('./routes');
  app.use('/api', apiRouter);
  console.log('✅ 已挂载真实 API 路由 (/api)');
} catch (e) {
  console.warn('⚠️ 挂载真实 API 路由失败，检查 ./routes 是否完整：', e.message);
}

// Health check
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

// 临时调试：直接在应用层提供 /api/__debug，验证 /api 前缀是否工作
app.get('/api/__debug', (_req, res) => {
  res.json({ ok: true, note: 'api prefix works at app level' });
});

// Serve public assets at root
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Serve Admin frontend (built dist) at /admin
const adminDist = path.join(__dirname, 'admin-frontend', 'dist');
if (fs.existsSync(adminDist)) {
  app.use('/admin', express.static(adminDist, { maxAge: '1h', setHeaders: setStaticHeaders }));
  const adminIndex = path.join(adminDist, 'index.html');
  if (fs.existsSync(adminIndex)) {
    app.get(['/admin', '/admin/*'], (_req, res) => {
      res.sendFile(adminIndex);
    });
  }
} else {
  // Fallback: serve legacy built files under public/admin if present
  const adminPub = path.join(__dirname, 'public', 'admin');
  if (fs.existsSync(adminPub)) {
    app.use('/admin', express.static(adminPub, { maxAge: '1h', setHeaders: setStaticHeaders }));
    const adminTest = path.join(adminPub, 'api-test.html');
    const adminIndexHtml = path.join(adminPub, 'index.html');
    app.get(['/admin', '/admin/*'], (req, res) => {
      // If index.html exists use it, otherwise try api-test.html
      if (fs.existsSync(adminIndexHtml)) return res.sendFile(adminIndexHtml);
      if (fs.existsSync(adminTest)) return res.sendFile(adminTest);
      return res.status(404).type('text/plain').send('管理后台页面未构建：请构建 admin-frontend 或提供 public/admin/index.html');
    });
  }
}

// Serve Shop frontend (built dist) at /shop
const shopDist = path.join(__dirname, 'shop-frontend', 'dist');
if (fs.existsSync(shopDist)) {
  app.use('/shop', express.static(shopDist, { maxAge: '1h', setHeaders: setStaticHeaders }));
  const shopIndex = path.join(shopDist, 'index.html');
  if (fs.existsSync(shopIndex)) {
    app.get(['/shop', '/shop/*'], (_req, res) => {
      res.sendFile(shopIndex);
    });
  }
} else {
  const shopPub = path.join(__dirname, 'public', 'shop');
  if (fs.existsSync(shopPub)) {
    app.use('/shop', express.static(shopPub, { maxAge: '1h', setHeaders: setStaticHeaders }));
    const shopIndexHtml = path.join(shopPub, 'index.html');
    app.get(['/shop', '/shop/*'], (req, res) => {
      if (fs.existsSync(shopIndexHtml)) return res.sendFile(shopIndexHtml);
      return res.status(404).type('text/plain').send('商城前台页面未构建：请构建 shop-frontend 或提供 public/shop/index.html');
    });
  }
}

// 直接提供 public/admin 的静态版本到 /admin-static（便于查看已构建页面）
const adminPub = path.join(__dirname, 'public', 'admin');
if (fs.existsSync(adminPub)) {
  app.use('/admin-static', express.static(adminPub, { maxAge: '1h', setHeaders: setStaticHeaders }));
  app.get(['/admin-static', '/admin-static/*'], (req, res) => {
    const adminIndexHtml = path.join(adminPub, 'index.html');
    const adminTest = path.join(adminPub, 'api-test.html');
    if (fs.existsSync(adminIndexHtml)) return res.sendFile(adminIndexHtml);
    if (fs.existsSync(adminTest)) return res.sendFile(adminTest);
    return res.status(404).type('text/plain').send('public/admin 下无 index.html/api-test.html');
  });
}

// 直接提供 public/shop 的静态版本到 /shop-static
const shopPub = path.join(__dirname, 'public', 'shop');
if (fs.existsSync(shopPub)) {
  app.use('/shop-static', express.static(shopPub, { maxAge: '1h', setHeaders: setStaticHeaders }));
  app.get(['/shop-static', '/shop-static/*'], (req, res) => {
    const shopIndexHtml = path.join(shopPub, 'index.html');
    if (fs.existsSync(shopIndexHtml)) return res.sendFile(shopIndexHtml);
    return res.status(404).type('text/plain').send('public/shop 下无 index.html');
  });
}

// 在开发模式下，将 /admin 与 /shop 重定向到各自 Vite 根路径，排除 *-static 路径
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

// Simple cache headers for static
function setStaticHeaders(res, filePath) {
  if (/\.(br|gz)$/.test(filePath)) {
    // Let the browser infer encoding by proper Content-Encoding if served via reverse proxy
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
  } else if (/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff2?)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
  }
}

// Fallback: show a simple landing if nothing else matched
app.get('/', (req, res, next) => {
  // If public/index.html exists, static middleware already served it.
  // Otherwise show a minimal landing.
  const indexHtml = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexHtml)) return next();
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>库存系统</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;max-width:720px;margin:48px auto;padding:0 16px;color:#1f2937}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}.card{border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:12px 0}</style>
</head>
<body>
  <h1>服装网店进销存</h1>
  <div class="card">
    <p>服务已启动。可访问：</p>
    <ul>
      <li>健康检查: <a href="/health">/health</a></li>
      <li>API 健康: <a href="/api/health">/api/health</a></li>
      <li>管理后台: <a href="/admin/">/admin/</a>（如已构建 dist）</li>
      <li>商城前台: <a href="/shop/">/shop/</a>（如已构建 dist）</li>
      <li>静态目录: <code>/public</code></li>
    </ul>
  </div>
</body>
</html>`);
});

// 自动寻找可用端口并启动服务，避免 EADDRINUSE
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
  // 优先命令行参数，其次环境变量，最后默认 3004
  const argvPort = Number(process.argv[2]);
  const envPort = Number(process.env.PORT);
  const desired = (Number.isFinite(argvPort) && argvPort > 0)
    ? argvPort
    : ((Number.isFinite(envPort) && envPort > 0) ? envPort : 3004);
  const source = (Number.isFinite(argvPort) && argvPort > 0)
    ? 'argv'
    : ((Number.isFinite(envPort) && envPort > 0) ? 'env' : 'default');

  const free = await findAvailablePort(desired, 50, HOST);
  const chosen = free ?? 0; // 0 表示让系统分配
  if (free !== null && free !== desired) {
    console.warn(`⚠️ 端口 ${desired} 已被占用，切换到可用端口 ${free}`);
  } else if (free === null) {
    console.warn(`⚠️ 无可用端口，改为使用随机端口`);
  }
  const server = app.listen(chosen, HOST, () => {
    const actual = server.address().port;
    console.log(`✅ Server listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${actual} (source=${source})`);
  });
  server.on('error', (err) => {
    console.error('Server error:', err);
  });
})();
