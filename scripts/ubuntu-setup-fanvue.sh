#!/usr/bin/env bash
# Run INSIDE Ubuntu (proot-distro login ubuntu).
# Bootstraps Node, clones/pulls fanvue, installs, starts the studio.
#
#   curl -fsSL https://raw.githubusercontent.com/rcullens/fanvue/main/scripts/ubuntu-setup-fanvue.sh | bash
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/rcullens/fanvue.git}"
REPO_DIR="${REPO_DIR:-$HOME/fanvue}"
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
SKIP_RUN="${SKIP_RUN:-0}"

export DEBIAN_FRONTEND=noninteractive

echo "==> Fanvue Ubuntu setup"
echo "    dir=$REPO_DIR port=$PORT"

echo "==> apt packages"
apt-get update -y
apt-get install -y git curl ca-certificates python3 ffmpeg gnupg

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(\".\")[0]' 2>/dev/null || echo 0)" -lt 18 ]; then
  echo "==> Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "    node=$(node -v) npm=$(npm -v)"

echo "==> Clone / pull repo"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull --ff-only || git -C "$REPO_DIR" pull
else
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"

echo "==> npm install"
npm install

if [ ! -f .env.local ] && [ -f .env.local.example ]; then
  cp .env.local.example .env.local
  echo "==> wrote .env.local from example"
fi

echo ""
echo "Ready. Open http://127.0.0.1:${PORT} on the phone browser."
echo ""

if [ "$SKIP_RUN" = "1" ]; then
  echo "SKIP_RUN=1 — not starting. Later:"
  echo "  cd \"$REPO_DIR\" && npm run dev -- -H $HOST -p $PORT"
  exit 0
fi

echo "==> starting Next.js"
exec npm run dev -- -H "$HOST" -p "$PORT"
