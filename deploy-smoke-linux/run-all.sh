#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# 1) 启动/初始化 MySQL（使用宿主机已安装的 mysqld）
# 若服务器未安装 MySQL，请先安装：Ubuntu: sudo apt-get update && sudo apt-get install -y mysql-server

export $(grep -v '^#' .env | xargs)

# 创建数据库与用户（幂等）
mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4;"
mysql -u root -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';"
mysql -u root -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%'; FLUSH PRIVILEGES;"

# 2) 启动后端（newserver.js）
(
  cd backend
  # 安装依赖
  if ! command -v pnpm >/dev/null 2>&1; then
    corepack enable && corepack prepare pnpm@9 --activate || true
  fi
  if [ -f package.json ]; then
    pnpm install || npm install
  fi
  export NODE_ENV=development PORT=${PORT} HOST=${HOST}
  nohup node newserver.js ${PORT} > backend.log 2>&1 &
  echo "Backend started on :${PORT} (pid=$!)"
)

# 3) 启动前端开发服务器（Admin/Shop）
(
  cd admin-frontend
  if ! command -v pnpm >/dev/null 2>&1; then
    corepack enable && corepack prepare pnpm@9 --activate
  fi
  pnpm install
  (nohup pnpm dev > ../admin-dev.log 2>&1 &); echo "Admin FE started on :9000"
)
(
  cd shop-frontend
  if ! command -v pnpm >/dev/null 2>&1; then
    corepack enable && corepack.prepare pnpm@9 --activate
  fi
  pnpm install
  (nohup pnpm dev > ../shop-dev.log 2>&1 &); echo "Shop FE started on :5173"
)

# 4) 初始化数据库表结构与种子数据
(
  cd backend
  # 使用 Node 执行一次性脚本：自动同步模型（由代码首次访问触发），然后导入测试数据与 SKU 重置
  node scripts/seed-database.js || true
  node scripts/reset-sku-inventory.js || true
  echo "DB seed & SKU reset done"
)

echo "All services started."
