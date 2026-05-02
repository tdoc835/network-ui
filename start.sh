#!/usr/bin/env bash
# Start NetLab — backend + frontend in one shot.
#
# Usage:  ./start.sh
# Stop with Ctrl-C — both processes are killed via the trap below.

set -euo pipefail

cd "$(dirname "$0")"

# Sanity check: OrbStack/Docker reachable?
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker isn't reachable. Start OrbStack first:"
  echo "    open -a OrbStack"
  exit 1
fi

# Backend ----------------------------------------------------------
if [ ! -d backend/.venv ]; then
  echo "→ Creating Python venv + installing deps"
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi

# Frontend ---------------------------------------------------------
if [ ! -d frontend/node_modules ]; then
  echo "→ Installing npm deps"
  (cd frontend && npm install)
fi

# Run -------------------------------------------------------------
echo "→ Starting backend on :8000"
backend/.venv/bin/uvicorn backend.main:app --reload --port 8000 &
BACK_PID=$!

echo "→ Starting frontend on :5173"
(cd frontend && npm run dev) &
FRONT_PID=$!

trap 'echo; echo "stopping…"; kill $BACK_PID $FRONT_PID 2>/dev/null || true' INT TERM
wait
