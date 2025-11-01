const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const PORT = Number(process.env.PORT || 3010) || 3010;

// 简易健康检查
app.get('/health', (_req, res) => res.send('OK'));

// 反向代理至真正 API（3004）
const target = process.env.API_TARGET || 'http://localhost:3004';
app.use('/api', createProxyMiddleware({ target, changeOrigin: true }));
app.use('/uploads', createProxyMiddleware({ target, changeOrigin: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Quickfix proxy on http://localhost:${PORT} -> ${target}`);
});
