# 将数据库脚本、后端、管理前端、商城前端分别打包，适合在 Linux 解压并单独启动
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'

# 路径
$deployRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (Resolve-Path (Join-Path $deployRoot '..')).Path
$outRoot = Join-Path $root 'release-smoke'
if (-not (Test-Path $outRoot)) { New-Item -ItemType Directory -Force -Path $outRoot | Out-Null }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$splitRoot = Join-Path $outRoot ("split-" + $ts)
New-Item -ItemType Directory -Force -Path $splitRoot | Out-Null

# robocopy 参数
$rcArgs = @('/E','/MT:8','/R:0','/W:0','/NFL','/NDL','/NP','/NJH','/NJS','/XJ')
$commonExcludes = @('node_modules','dist','.git','.vscode','recovery','backup','public\uploads')

function Copy-Dir {
  param(
    [string]$Src,
    [string]$Dst,
    [string[]]$ExcludeDirs
  )
  if (-not (Test-Path $Dst)) { New-Item -ItemType Directory -Force -Path $Dst | Out-Null }
  $xd = @()
  foreach ($d in $ExcludeDirs) { $xd += @('/XD', (Join-Path $Src $d)) }
  robocopy $Src $Dst '*.*' @rcArgs @xd | Out-Null
}

function Copy-Safe {
  param(
    [string]$Source,
    [string]$Dest,
    [string[]]$Items,
    [string[]]$ExcludeDirs
  )
  if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Force -Path $Dest | Out-Null }
  foreach ($item in $Items) {
    $src = Join-Path $Source $item
    $dst = Join-Path $Dest $item
    Write-Host ("[COPY] " + $item)
    try {
      if (Test-Path $src -PathType Leaf) {
        $parent = Split-Path -Parent $dst
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        Copy-Item -Path $src -Destination $dst -Force -ErrorAction Stop
      } elseif (Test-Path $src -PathType Container) {
        Copy-Dir -Src $src -Dst $dst -ExcludeDirs $ExcludeDirs
      } else {
        Write-Warning ("源不存在，跳过: " + $src)
      }
    } catch {
      Write-Warning ("复制失败，回退: " + $_.Exception.Message)
      try { Copy-Item -Path $src -Destination $dst -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
    Write-Host ("[DONE] " + $item)
  }
}

# 1) Backend 包
$backendDir = Join-Path $splitRoot 'backend'
$backendItems = @('newserver.js','routes','models','middleware','services','public','scripts','config','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.env')
Copy-Safe -Source $root -Dest $backendDir -Items $backendItems -ExcludeDirs $commonExcludes

# 写入 backend 启动说明与脚本
$backendReadme = @'
# Backend (Linux)

依赖: Node.js 20+, pnpm(可自动用 corepack 启用), MySQL 8+

- 启动: ./run-backend.sh
- 健康检查: http://127.0.0.1:3000/api/_ping
'@
Set-Content -Path (Join-Path $backendDir 'README-LINUX.md') -Value $backendReadme -Encoding UTF8
$backendRun = @'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable && corepack prepare pnpm@9 --activate || true
fi
[ -f package.json ] && (pnpm install || npm install)
export $(grep -v '^#' .env | xargs || true)
export NODE_ENV=${NODE_ENV:-development}
PORT=${PORT:-3000} HOST=${HOST:-0.0.0.0}
nohup node newserver.js ${PORT} > backend.log 2>&1 &
echo "Backend started on :${PORT} (pid=$!)"
'@
Set-Content -Path (Join-Path $backendDir 'run-backend.sh') -Value $backendRun -Encoding UTF8

# 2) Admin 前端包
$adminDir = Join-Path $splitRoot 'admin'
Copy-Safe -Source $root -Dest $adminDir -Items @('admin-frontend') -ExcludeDirs $commonExcludes
$adminReadme = @'
# Admin Frontend (Linux)

依赖: Node.js 20+, pnpm

- 开发/联调启动: ./run-admin.sh （Vite dev server, :9000）
'@
Set-Content -Path (Join-Path $adminDir 'README-LINUX.md') -Value $adminReadme -Encoding UTF8
$adminRun = @'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/admin-frontend"
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable && corepack.prepare pnpm@9 --activate || true
fi
pnpm install
nohup pnpm dev -- --host --port 9000 > ../admin-dev.log 2>&1 &
echo "Admin FE started on :9000 (pid=$!)"
'@
Set-Content -Path (Join-Path $adminDir 'run-admin.sh') -Value $adminRun -Encoding UTF8

# 3) Shop 前端包
$shopDir = Join-Path $splitRoot 'shop'
Copy-Safe -Source $root -Dest $shopDir -Items @('shop-frontend') -ExcludeDirs $commonExcludes
$shopReadme = @'
# Shop Frontend (Linux)

依赖: Node.js 20+, pnpm

- 开发/联调启动: ./run-shop.sh （Vite dev server, :5173）
'@
Set-Content -Path (Join-Path $shopDir 'README-LINUX.md') -Value $shopReadme -Encoding UTF8
$shopRun = @'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/shop-frontend"
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable && corepack.prepare pnpm@9 --activate || true
fi
pnpm install
nohup pnpm dev -- --host --port 5173 > ../shop-dev.log 2>&1 &
echo "Shop FE started on :5173 (pid=$!)"
'@
Set-Content -Path (Join-Path $shopDir 'run-shop.sh') -Value $shopRun -Encoding UTF8

# 4) DB 初始化包（包含 models/config/scripts 以独立运行种子脚本）
$dbDir = Join-Path $splitRoot 'db'
Copy-Safe -Source $root -Dest $dbDir -Items @('models','config','scripts','package.json','pnpm-lock.yaml','.env') -ExcludeDirs $commonExcludes
$dbReadme = @'
# Database Init (Linux)

依赖: Node.js 20+, pnpm, MySQL 8+

- 初始化数据库与种子数据: ./init-db.sh
'@
Set-Content -Path (Join-Path $dbDir 'README-LINUX.md') -Value $dbReadme -Encoding UTF8
$dbInit = @'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export $(grep -v '^#' .env | xargs || true)
DB_NAME=${DB_NAME:-inventory}
DB_USER=${DB_USER:-inventory}
DB_PASSWORD=${DB_PASSWORD:-inventory}
mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4;"
mysql -u root -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';"
mysql -u root -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%'; FLUSH PRIVILEGES;"
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable && corepack.prepare pnpm@9 --activate || true
fi
[ -f package.json ] && (pnpm install || npm install)
node scripts/seed-database.js || true
node scripts/reset-sku-inventory.js || true
echo "DB init done"
'@
Set-Content -Path (Join-Path $dbDir 'init-db.sh') -Value $dbInit -Encoding UTF8

# 压缩函数
function Pack-Dir {
  param([string]$Dir)
  $base = Split-Path -Leaf $Dir
  $dest = Join-Path $splitRoot ($base + '.tar.gz')
  if (Get-Command tar -ErrorAction SilentlyContinue) {
    Push-Location (Split-Path -Parent $Dir)
    tar -czf $dest $base
    Pop-Location
  } else {
    $dest = Join-Path $splitRoot ($base + '.zip')
    if (Test-Path $dest) { Remove-Item $dest -Force }
    Compress-Archive -Path (Join-Path $Dir '*') -DestinationPath $dest
  }
  Write-Host ("[PACK] => " + $dest)
}

# 压缩四个包
Pack-Dir -Dir $backendDir
Pack-Dir -Dir $adminDir
Pack-Dir -Dir $shopDir
Pack-Dir -Dir $dbDir

Write-Host "DONE. 输出目录: $splitRoot"
