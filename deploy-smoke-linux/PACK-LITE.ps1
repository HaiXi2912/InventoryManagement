# 直接就地打包（排除 node_modules/.git 等），不复制中间目录，速度更快
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
$deployRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (Resolve-Path (Join-Path $deployRoot '..')).Path
$outRoot = Join-Path $root 'release-smoke'
if (-not (Test-Path $outRoot)) { New-Item -ItemType Directory -Force -Path $outRoot | Out-Null }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$zip = Join-Path $outRoot ("smoke-lite-" + $ts + ".zip")

Write-Host "[PACK-LITE] 开始就地打包..."
# 需要包含的目录与根文件
$includeDirs = @('admin-frontend','shop-frontend','routes','models','middleware','services','public','scripts','config')
$rootFiles = @('newserver.js','pnpm-lock.yaml','pnpm-workspace.yaml','.env','package.json')

# 收集文件，排除大目录
$patterns = '\\node_modules\\|\\\.git\\|\\\.vscode\\|\\recovery\\|\\backup\\|\\dist(\\|$)|\\public\\uploads\\'
$allFiles = New-Object System.Collections.Generic.List[string]
foreach ($d in $includeDirs) {
  $p = Join-Path $root $d
  if (Test-Path $p) {
    Write-Host ("[PACK-LITE] 收集目录: " + $p)
    try {
      Get-ChildItem -Path $p -Recurse -File -Force -ErrorAction Stop |
        Where-Object { $_.FullName -notmatch $patterns } |
        ForEach-Object { [void]$allFiles.Add($_.FullName) }
    } catch {
      # 静默忽略目录遍历错误
      try {
        Get-ChildItem -Path $p -File -Force -ErrorAction SilentlyContinue |
          Where-Object { $_.FullName -notmatch $patterns } |
          ForEach-Object { [void]$allFiles.Add($_.FullName) }
      } catch {}
    }
  } else {
    Write-Host ("[PACK-LITE] 跳过不存在目录: " + $p)
  }
}

$rootFilePaths = New-Object System.Collections.Generic.List[string]
foreach ($f in $rootFiles) {
  $fp = Join-Path $root $f
  if (Test-Path $fp) { [void]$rootFilePaths.Add($fp) } else { Write-Host ("[PACK-LITE] 跳过不存在文件: " + $fp) }
}

# 去重并排序
$paths = @()
$paths = ($allFiles + $rootFilePaths) | Sort-Object -Unique
Write-Host ("[PACK-LITE] 文件总数(去重后): " + $paths.Count)

# 压缩（分批）
if (Test-Path $zip) { Remove-Item $zip -Force }
$batch = 100
for ($i = 0; $i -lt $paths.Count; $i += $batch) {
  $end = [Math]::Min($i + $batch - 1, $paths.Count - 1)
  $chunk = $paths[$i..$end] | Where-Object { Test-Path $_ }
  if ($i -eq 0) {
    Compress-Archive -Path $chunk -DestinationPath $zip -CompressionLevel Optimal
  } else {
    Compress-Archive -Path $chunk -DestinationPath $zip -Update
  }
  Write-Host ("[PACK-LITE] 进度: " + ($end+1) + "/" + $paths.Count)
}

Write-Host ("[PACK-LITE] OK => " + $zip)
Write-Output $zip
