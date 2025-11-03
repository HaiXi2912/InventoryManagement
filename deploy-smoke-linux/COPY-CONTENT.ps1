# Windows 快速打包拷贝到 Linux 前
$ErrorActionPreference='Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# 复制后端/前端/脚本源码（最小化，仅需工作目录即可）
robocopy "$root\.." "$root\backend" newserver.js routes models middleware services public scripts package.json pnpm-lock.yaml pnpm-workspace.yaml /E /XO /XD node_modules admin-frontend shop-frontend .git .vscode recovery backup dist
robocopy "$root\..\admin-frontend" "$root\admin-frontend" *.* /E /XO /XD node_modules dist .git .vscode
robocopy "$root\..\shop-frontend" "$root\shop-frontend" *.* /E /XO /XD node_modules dist .git .vscode

Write-Host 'OK'
