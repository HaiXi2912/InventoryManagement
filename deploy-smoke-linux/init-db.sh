#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export $(grep -v '^#' .env | xargs)

mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4;"
mysql -u root -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';"
mysql -u root -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%'; FLUSH PRIVILEGES;"

# 运行种子与库存重置
node ./scripts/seed-database.js || true
node ./scripts/reset-sku-inventory.js || true

echo "DB init done"
