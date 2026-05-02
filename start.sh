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

# Custom images ---------------------------------------------------
# Build netlab-host / netlab-router only when their Dockerfile content
# (or the corresponding image presence) has changed. The sentinel stores
# the sha256 of each Dockerfile so an edit triggers a rebuild on next run.
mkdir -p docker/.cache
build_if_needed() {
  local tag="$1" file="$2"
  local sentinel="docker/.cache/${tag}.sha"
  local current
  current=$(shasum -a 256 "$file" | awk '{print $1}')
  if [ -f "$sentinel" ] && [ "$(cat "$sentinel")" = "$current" ] \
      && docker image inspect "$tag" >/dev/null 2>&1; then
    return 0
  fi
  echo "→ Building $tag from $file"
  docker build -t "$tag" -f "$file" docker/
  echo "$current" > "$sentinel"
}
build_if_needed netlab-host   docker/Dockerfile.host
build_if_needed netlab-router docker/Dockerfile.router

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
