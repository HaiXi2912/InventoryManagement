// 极简独立后端入口，直连 /api 路由，绕过复杂 server.js
const express = require('express');
require('dotenv').config();

const HOST = process.env.HOST || '127.0.0.1';
// 优先使用命令行参数，其次环境变量，最后默认 3200，避免遗留环境变量污染端口
const argvPort = Number(process.argv[2]);
const envPort = Number(process.env.PORT);
const PORT = (Number.isFinite(argvPort) && argvPort > 0)
  ? argvPort
  : ((Number.isFinite(envPort) && envPort > 0) ? envPort : 3200);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康与探针
app.get('/health', (_req, res) => res.status(200).send('OK'));
app.get('/api/_ping', (_req, res) => res.json({ ok: true, t: Date.now() }));

let apiRouter = null;
// 挂载真实 API
try {
  apiRouter = require('./routes');
  app.use('/api', apiRouter);
  console.log('✅ 已挂载 /api 路由 (standalone)');
} catch (e) {
  console.error('❌ 挂载 /api 失败: ', e.message);
}

// 诊断端点：确认入口文件与路由注册（根路径）
app.get('/__whoami', (_req, res) => {
  res.json({ entry: 'standalone-api.js', host: HOST, port: PORT, hasApiRouter: Boolean(apiRouter) });
});
app.get('/__routes', (_req, res) => {
  const list = [];
  if (apiRouter && apiRouter.stack) {
    apiRouter.stack.forEach((layer) => {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {}).map((m) => m.toUpperCase());
        list.push({ path: `/api${layer.route.path}`, methods });
      }
    });
  }
  res.json({ ok: true, entry: 'standalone-api.js', routes: list });
});

// 诊断端点（/api 前缀，便于经由前端代理访问）
app.get('/api/__whoami', (_req, res) => {
  res.json({ entry: 'standalone-api.js', host: HOST, port: PORT, hasApiRouter: Boolean(apiRouter) });
});
app.get('/api/__routes', (_req, res) => {
  const list = [];
  if (apiRouter && apiRouter.stack) {
    apiRouter.stack.forEach((layer) => {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {}).map((m) => m.toUpperCase());
        list.push({ path: `/api${layer.route.path}`, methods });
      }
    });
  }
  res.json({ ok: true, entry: 'standalone-api.js', routes: list });
});

app.listen(PORT, HOST, () => {
  const source = Number.isFinite(argvPort) ? 'argv' : (Number.isFinite(envPort) ? 'env' : 'default');
  console.log(`✅ Standalone API listening on http://${HOST}:${PORT} (source=${source})`);
});
