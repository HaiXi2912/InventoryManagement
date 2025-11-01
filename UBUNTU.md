# 在 Ubuntu 下运行本项目

本文档介绍在 Ubuntu 22.04+/20.04 上本地开发运行本项目的步骤。

## 1. 安装依赖

- Node.js 18+（推荐使用 nvm 安装）
- pnpm（通过 corepack 启用）
- MySQL 8+

```bash
# 安装基础工具
sudo apt update && sudo apt install -y curl build-essential git

# 安装 nvm（可选，推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# 重新加载 shell 配置后执行
nvm install --lts

# 启用 pnpm（Node.js 16.13+ 内置 corepack）
corepack enable
pnpm -v

# 安装 MySQL（如未安装）
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
```

## 2. 创建数据库与用户

```bash
# 进入 MySQL，设置数据库和账号（按需修改密码）
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS clothing_inventory_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'inventory'@'localhost' IDENTIFIED BY 'Your_Strong_Password_123!';
GRANT ALL PRIVILEGES ON clothing_inventory_db.* TO 'inventory'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 3. 配置环境变量

在项目根目录复制并编辑 .env：

```bash
cd /path/to/进销存/1.1
cp .env.example .env

# 使用你自己的编辑器修改 .env：
# 建议至少修改以下字段：
# PORT=3004             # 与前端 Vite 代理一致
# DB_HOST=localhost
# DB_PORT=3306
# DB_NAME=clothing_inventory_db
# DB_USER=inventory
# DB_PASSWORD=Your_Strong_Password_123!
```

注意：后端默认端口为 3004（server.js），管理后台与商店前端的开发代理也已指向 3004。

## 4. 安装依赖并初始化数据库

```bash
# 后端依赖
npm install

# 初始化数据库（创建表、种子数据视情况执行）
npm run db:init
# 可选：npm run db:seed
```

## 5. 启动服务（开发模式）

建议在三个终端分别启动：

```bash
# 终端 A：后端 API（默认 http://localhost:3004）
npm run dev

# 终端 B：管理后台（默认 http://localhost:9000）
cd admin-frontend
pnpm install
pnpm dev

# 终端 C：商店前端（默认 http://localhost:5173）
cd shop-frontend
pnpm install
pnpm dev
```

访问地址：
- 后端健康检查: http://localhost:3004/health
- 管理后台: http://localhost:9000
- 商店前端: http://localhost:5173

## 6. 常见问题排查

- ECONNREFUSED（代理连接被拒）：
  - 确认后端已启动并监听 3004；
  - 确认根目录 `.env` 中 `PORT=3004`；
  - 管理后台与商店前端的 Vite 代理目标均为 `http://localhost:3004`。
- 数据库连接失败：
  - 确认 MySQL 在运行：`systemctl status mysql`；
  - 用 `.env` 中的账号密码可登录：`mysql -u inventory -p`；
  - 数据库名、端口与权限配置正确。
- 认证接口 401：
  - 需要先在前端登录后再访问需要鉴权的 API。

## 7. 生产运行（简要）

- 后端：
  - 生产启动：`NODE_ENV=production PORT=3004 node server.js`
  - 或使用 pm2：`pm2 start server.js --name inventory-api --env production`
- 前端：
  - 管理后台构建：`cd admin-frontend && pnpm install && pnpm build`
  - 商店前端构建：`cd shop-frontend && pnpm install && pnpm build`
  - 使用任意静态服务器/反向代理（如 Nginx）托管打包结果，并将 `/api` 反向代理到 `http://127.0.0.1:3004`。

如需自动化脚本或 systemd 服务示例，可告诉我你的偏好（pm2/systemd/docker）。

## 账户体系与权限（重要变更）

- 账户分为两大类：
  - 平台账户（account_type=platform）：管理员 admin、客服 manager/staff、渠道商 agent、工厂 factory 等。无余额钱包概念，仅用于后台操作与权限控制。
  - 购物用户（account_type=user，role=customer）：注册商城用户，拥有余额钱包（wallet），可用于下单等。

- 权限/菜单：
  - 后端通过 JWT 携带 role 与 account_type，前端应根据返回的 user.role 与 user.account_type 动态渲染菜单。无权限页面不显示菜单项，且路由守卫禁止跳转进入。
  - 路由上使用 authorize([...]) 强制校验角色，杜绝越权。

- 注册赠送余额：
  - 新注册的购物用户（/api/auth/register）会创建用户 User(account_type=user, role=customer) 与对应客户 Customer，并在 wallet_transactions 写入一条充值流水（signup_bonus）默认 1000 元。
  - 平台账户无余额，所有 /api/users/:id/wallet* 接口仅对购物用户开放；平台用户访问会返回“平台账户无余额”。

- 平台账户管理：
  - /api/users 默认仅管理平台账户（排除 role=customer）。
  - 仅 admin 可创建/禁用平台账户；admin、manager 可查询列表；wallet 接口仅对购物用户生效。

## 接口要点

- 登录 /api/auth/login 返回数据包含 account_type，用于前端菜单控制。
- 当前用户 /api/auth/me 返回 user（含 account_type）。
- 注册 /api/auth/register：返回 bonus 字段=1000。
- 用户余额：GET /api/users/:id/wallet（仅 customer）。
