#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
export $(grep -v '^#' ../.env | xargs)
nohup node newserver.js ${PORT:-3000} > backend.log 2>&1 &
echo "Backend started on :${PORT:-3000} (pid=$!)"
