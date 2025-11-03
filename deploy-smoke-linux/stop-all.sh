#!/usr/bin/env bash
set -euo pipefail
# 简单结束常见开发端口上的 node 进程
for p in 3000 5173 9000; do
  pid=$(lsof -ti tcp:$p || true)
  if [ -n "$pid" ]; then
    kill -9 $pid || true
    echo "killed port $p (pid=$pid)"
  fi
done
