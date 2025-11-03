# 构建前端 dist，并与后端一起打成可直接在 Linux 运行的包（由 newserver.js 提供 /admin 与 /shop 静态资源）
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'

$deployRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (Resolve-Path (Join-Path $deployRoot '..')).Path
$outRoot = Join-Path $root 'release-smoke'
if (-not (Test-Path $outRoot)) { New-Item -ItemType Directory -Force -Path $outRoot | Out-Null }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $outRoot ("dist-" + $ts)
New-Item -ItemType Directory -Force -Path $work | Out-Null

function Build-Frontend {
  param([string]$dir)
  Push-Location $dir
  try {
    # 屏蔽 preinstall (only-allow pnpm) 等脚本
    $env:NPM_CONFIG_IGNORE_SCRIPTS = 'true'
    npm install --legacy-peer-deps
  } catch {
    Write-Warning "npm install --legacy-peer-deps 失败，尝试 --force"
    npm install --force
  } finally {
    Remove-Item Env:NPM_CONFIG_IGNORE_SCRIPTS -ErrorAction SilentlyContinue
  }
  # 跳过 vue-tsc，直接构建 vite
  npx vite build
  Pop-Location
}

# 1) 构建前端 dist（统一使用 npm + vite）
if (Test-Path (Join-Path $root 'admin-frontend')) { Build-Frontend -dir (Join-Path $root 'admin-frontend') }
if (Test-Path (Join-Path $root 'shop-frontend')) { Build-Frontend -dir (Join-Path $root 'shop-frontend') }

# 2) 组装“一包到底”目录（包含后端与前端 dist，全部放置于同一层级）
$pkg = $work
# 复制后端必要文件到 $pkg
$rcArgs = @('/E','/MT:8','/R:0','/W:0','/NFL','/NDL','/NP','/NJH','/NJS','/XJ')

# 2.1 拷贝目录（逐个目录拷贝，确保内容完整）
$dirs = @('routes','models','middleware','services','scripts','public','config')
foreach ($d in $dirs) {
  $src = Join-Path $root $d
  if (Test-Path $src) {
    $dst = Join-Path $pkg $d
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    robocopy $src $dst '*.*' @rcArgs | Out-Null
  }
}

# 2.2 拷贝文件
$files = @('newserver.js','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.env')
foreach ($f in $files) {
  $src = Join-Path $root $f
  if (Test-Path $src) { Copy-Item -Force $src -Destination (Join-Path $pkg (Split-Path $src -Leaf)) }
}

# 确保 public/admin 与 public/shop 目录存在
$publicDir = Join-Path $pkg 'public'
if (-not (Test-Path $publicDir)) { New-Item -ItemType Directory -Force -Path $publicDir | Out-Null }
$adminPub = Join-Path $publicDir 'admin'
$shopPub  = Join-Path $publicDir 'shop'
New-Item -ItemType Directory -Force -Path $adminPub | Out-Null
New-Item -ItemType Directory -Force -Path $shopPub | Out-Null

# 注入前端 dist 到 public/admin 与 public/shop（而非保留 admin-frontend/ 与 shop-frontend/ 目录）
$adminDistSrc = Join-Path $root 'admin-frontend\dist'
if (Test-Path $adminDistSrc) { robocopy $adminDistSrc $adminPub '*.*' @rcArgs | Out-Null }
$shopDistSrc = Join-Path $root 'shop-frontend\dist'
if (Test-Path $shopDistSrc) { robocopy $shopDistSrc $shopPub '*.*' @rcArgs | Out-Null }

# 写入 Linux 启动说明（顶层）
$readme = @'
# All-in-One Package (Linux)

依赖: Node.js 20+, MySQL 8+

步骤:
1) 解压本包
2) 安装依赖并启动：
   chmod +x run.sh
   ./run.sh
3) 访问：
   - API:   http://127.0.0.1:3000/api/_ping
   - Admin: http://127.0.0.1:3000/admin
   - Shop:  http://127.0.0.1:3000/shop

说明: newserver.js 将自动托管 public/admin 与 public/shop。
'@
Set-Content -Path (Join-Path $pkg 'README-LINUX.md') -Value $readme -Encoding UTF8

# 顶层启动脚本（run.sh）
$run = @'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# 后端依赖使用 npm（优先跳过 dev 依赖）
npm install --omit=dev || npm install
# 导入 .env（可选）
export $(grep -v '^#' .env | xargs || true)
export NODE_ENV=${NODE_ENV:-production}
PORT=${PORT:-3000} HOST=${HOST:-0.0.0.0}
nohup node newserver.js ${PORT} > app.log 2>&1 &
echo "App started on :${PORT} (pid=$!)"
'@
Set-Content -Path (Join-Path $pkg 'run.sh') -Value $run -Encoding UTF8

# 3) 压缩输出（以 $pkg 为根打包，不再嵌套 backend/）
$archive = Join-Path $outRoot ("dist-" + $ts + ".tar.gz")
if (Get-Command tar -ErrorAction SilentlyContinue) {
  Push-Location $work
  tar -czf $archive -C $work .
  Pop-Location
} else {
  $archive = Join-Path $outRoot ("dist-" + $ts + ".zip")
  if (Test-Path $archive) { Remove-Item $archive -Force }
  Compress-Archive -Path (Join-Path $work '*') -DestinationPath $archive
}

Write-Host ("[PACK-DIST] => " + $archive)
Write-Output $archive
