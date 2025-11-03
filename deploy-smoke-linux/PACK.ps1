# 打包最小冒烟部署包（Windows 打包，Linux 解压运行）
$ErrorActionPreference = 'Stop'
# 统一 UTF-8，避免控制台乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 基准路径
$deployRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (Resolve-Path (Join-Path $deployRoot '..')).Path

# 输出与工作目录
$outRoot = Join-Path $root 'release-smoke'
if (-not (Test-Path $outRoot)) { New-Item -ItemType Directory -Force -Path $outRoot | Out-Null }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $outRoot ("smoke-" + $ts)
New-Item -ItemType Directory -Force -Path $work | Out-Null

# robocopy 静默/加速参数
$rcArgs = @('/E','/MT:16','/R:0','/W:0','/NFL','/NDL','/NP','/NJH','/NJS','/XJ')

Write-Host "[1/4] 复制冒烟模板..."
# 复制 deploy-smoke-linux 模板（README、脚本、.env 等）
robocopy $deployRoot $work *.* @rcArgs /XD backend admin-frontend shop-frontend node_modules .git .vscode | Out-Null
Write-Host "[1/4] OK"

Write-Host "[2/4] 复制后端源码..."
# 复制后端源码到 work/backend，排除大体积上传目录以加速冒烟包（逐项复制，便于定位卡住项）
$backend = Join-Path $work 'backend'
New-Item -ItemType Directory -Force -Path $backend | Out-Null
$backendItems = @('newserver.js','routes','models','middleware','services','public','scripts','config','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.env')
foreach ($item in $backendItems) {
  Write-Host ("[2/4] -> " + $item)
  try {
    robocopy $root $backend $item @rcArgs /XD node_modules admin-frontend shop-frontend .git .vscode recovery backup dist public\uploads | Out-Null
  } catch {
    Write-Warning ("robocopy 失败，回退到 Copy-Item: " + $item + " => " + $_.Exception.Message)
    $src = Join-Path $root $item
    $dst = Join-Path $backend $item
    if (Test-Path $src) { Copy-Item -Path $src -Destination $dst -Recurse -Force -ErrorAction SilentlyContinue }
  }
}
Write-Host "[2/4] OK"

Write-Host "[3/4] 复制前端源码..."
# Admin 前端
$adminSrc = Join-Path $root 'admin-frontend'
$adminDst = Join-Path $work 'admin-frontend'
New-Item -ItemType Directory -Force -Path $adminDst | Out-Null
robocopy $adminSrc $adminDst *.* @rcArgs /XD node_modules dist .git .vscode | Out-Null
# Shop 前端
$shopSrc = Join-Path $root 'shop-frontend'
$shopDst = Join-Path $work 'shop-frontend'
New-Item -ItemType Directory -Force -Path $shopDst | Out-Null
robocopy $shopSrc $shopDst *.* @rcArgs /XD node_modules dist .git .vscode | Out-Null
Write-Host "[3/4] OK"

Write-Host "[4/4] 生成归档包..."
# 优先 tar.gz，其次 zip
$archive = Join-Path $outRoot ("smoke-" + $ts + ".tar.gz")
if (Get-Command tar -ErrorAction SilentlyContinue) {
  Push-Location $work
  tar -czf $archive .
  Pop-Location
} else {
  $archive = Join-Path $outRoot ("smoke-" + $ts + ".zip")
  if (Test-Path $archive) { Remove-Item $archive -Force }
  Compress-Archive -Path (Join-Path $work '*') -DestinationPath $archive
}

Write-Host ("OK => " + $archive)
Write-Output $archive
