# 服装网店进销存 部署与运行手册

本手册包含后端(API)、数据库、管理端前端、商城前端的一站式打包与部署说明（Windows/PowerShell）。

## 1. 环境准备
- Node.js 20+
- MySQL 8+
- PowerShell 7 建议（Windows PowerShell 也可）
- pnpm (管理端需要) - 如未安装，脚本会自动安装

## 2. 数据库配置
在项目根目录创建并检查 `.env`（已存在请核对）：

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=clothing_inventory_db
PORT=3004
JWT_SECRET=change_me
NODE_ENV=production
```

## 3. 一键构建与发布
使用 PowerShell 在项目根目录执行：

```
./scripts/build-all.ps1
```

脚本将执行：
1) 后端依赖安装 (npm ci)
2) 数据库初始化 (npm run db:init) - 创建/更新所有表（包括 factory_payments 等新表）
3) 构建管理端前端 (pnpm -C admin-frontend install && pnpm -C admin-frontend build)
4) 构建商城前端 (npm --prefix shop-frontend ci && npm --prefix shop-frontend run build)
5) 将管理端/商城 产物发布到 `public/admin` 与 `public/shop` 目录

完成后可直接由后端静态托管：
- 管理端: http://localhost:3004/admin/
- 商城端: http://localhost:3004/shop/

> 注意：代理到 API 的跨域/代理配置已在后端完成，生产部署建议通过 Nginx 反向代理到 Node 服务。

## 4. 启动后端服务
```
npm start
```
或：
```
node server.js
```
启动后：
- 健康检查: http://localhost:3004/health
- API 前缀: http://localhost:3004/api

## 5. 首次初始化/验收流程
1) 确认健康检查与数据库连接 OK
2) 访问管理端 http://localhost:3004/admin/
3) 使用默认管理员登录（若首次初始化，账号将自动创建）：
   - 用户名: admin
   - 密码: admin123
4) 在“统计 -> 日清月结”执行“关账日清/关账本月”
5) 在“统计 -> 日清月结 -> 工厂结算”发起日结/月结，验证：
   - 同日只允许日结一次（后端已校验）
   - 月结会自动扣除当日已做的日结金额
6) 在商城前台完成登录/购物车/结算/支付流程，校验钱包余额与支付联动

## 6. 生产环境建议
- 使用 `pm2` 或 `systemd` 进行 Node 进程守护
- 使用 Nginx 反向代理：
  - `/api/` 反向到 Node 3004
  - `/admin/` 与 `/shop/` 由 Node 静态托管或 Nginx 直接托管打包产物
- 启用 HTTPS 与 Gzip/Br 压缩
- 配置数据库备份策略（每日/每周）

## 7. 常见问题
- 表不存在（如 factory_payments）：
  - 运行 `npm run db:init` 重新同步模型（sequelize.sync({ alter: true }))
- 端口占用：
  - 设置环境变量 `PORT=3005` 或释放占用端口
- 构建失败缺少 pnpm：
  - 手动运行 `npm i -g pnpm`

## 8. 本地开发命令
- 后端开发热重载：`npm run dev`
- 管理端：`pnpm -C admin-frontend dev`
- 商城端：`npm --prefix shop-frontend run dev`

## 9. 目录说明
- `public/admin/` 管理端打包产物
- `public/shop/` 商城端打包产物
- `scripts/build-all.ps1` 一键构建脚本

如需 Docker 化或离线包，请告知目标环境与要求。
