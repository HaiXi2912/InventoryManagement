# 服装进销存 最小冒烟部署（Linux）

本包用于在一台 Linux 服务器上快速完成最小可运行验证（后端 API + Admin/Shop 前端开发服 + MySQL 数据库初始化）。适合内网/单机演示与功能验证，不适合生产环境。

## 目录结构

- backend/        Node.js 后端（newserver.js，端口 3000）
- admin-frontend/ 管理前端源码（Vite 开发服，端口 9000）
- shop-frontend/  商城前端源码（Vite 开发服，端口 5173）
- mysql/          MySQL 数据持久化目录（数据卷）
- scripts/        初始化脚本（创建库、建表、导入测试数据、SKU库存重置）
- .env            环境变量（数据库连接、JWT、端口等）

## 运行前提

- Linux x64（Ubuntu 20.04+/Debian/CentOS 均可）
- 已安装：
  - Node.js 20.x
  - pnpm 9（已在脚本中用 corepack 自动启用）
  - MySQL 8.x（或 MariaDB 10.6+）

## 一键启动（后端 + 前端 + MySQL）

1. 拷贝本目录到服务器，例如：`/opt/inventory/deploy-smoke-linux`
2. 填写 `.env` 中数据库密码、库名等（默认已配置 demo 值，可直接用）
3. 执行：

   bash run-all.sh

   首次会自动：
   - 安装后端依赖（backend/package.json）并启动 API(3000)
   - 安装前端依赖并启动 Admin(9000)/Shop(5173)
   - 初始化 MySQL 并导入测试数据

4. 验证：
   - API 健康检查: http://127.0.0.1:3000/api/_ping
   - Admin:       http://127.0.0.1:9000
   - Shop:        http://127.0.0.1:5173

## 重要端口

- 后端 API: 3000（如被占用，将自动顺延或随机端口，访问 /__whoami 查看实际端口）
- Admin 前端: 9000
- Shop 前端: 5173
- MySQL: 3306

## 常用命令

- 仅启动后端：

  bash run-api.sh

- 仅初始化数据库（建库 + 同步模型 + 种子数据 + SKU库存重置）：

  bash init-db.sh

- 停止所有开发服（前端/后端）：

  bash stop-all.sh

## 账号信息

- 管理员：admin / 123456
- 测试老板/员工等见种子脚本 `scripts/seed-database.js`
- 新注册用户（/api/auth/register）将自动获得 1000 钱包余额

## 持久化与数据位置

- MySQL 数据目录：`mysql/data`
- 后端上传目录：`backend/public/uploads`

## 注意

- 本方案使用 Vite 开发服务器提供前端，适合验证接口与前端联调，不建议直接对公网。生产请使用 CI 构建静态文件并由 Nginx 提供。
- 如果端口被占用，后端会自动顺延到可用端口；可用 GET /__whoami 查看实际端口。
