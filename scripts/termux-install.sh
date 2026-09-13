#!/data/data/com.termux/files/usr/bin/bash
# Fanvue AI Profile Studio — all-in-one Termux install + run
# Usage (from anywhere):
#   curl -fsSL https://raw.githubusercontent.com/rcullens/fanvue/main/scripts/termux-install.sh | bash
# Or after clone:
#   bash scripts/termux-install.sh
#
# Env knobs:
#   REPO_DIR=~/fanvue          install location
#   PORT=3000                 Next.js port
#   SKIP_RUN=1                install only, don't start
#   SKIP_TTS=1                skip edge-tts pip install

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/rcullens/fanvue.git}"
REPO_DIR="${REPO_DIR:-$HOME/fanvue}"
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"

echo "==> Fanvue AI Profile Studio (Termux)"
echo "    dir=$REPO_DIR  port=$PORT"

# Detect Termux-ish environment (warn but continue)
if [ -z "${PREFIX:-}" ] || [[ "${PREFIX}" != *com.termux* ]]; then
  echo "!! Not clearly Termux (PREFIX unset). Continuing anyway…"
fi

echo "==> Updating packages"
pkg update -y
pkg install -y git python ffmpeg openssl curl || true
# Prefer LTS Node if available
if pkg search nodejs-lts 2>/dev/null | grep -q '^nodejs-lts'; then
  pkg install -y nodejs-lts
else
  pkg install -y nodejs
fi

NODE_VER="$(node -v 2>/dev/null || true)"
echo "    node=$NODE_VER"
MAJOR="$(echo "$NODE_VER" | sed -E 's/^v([0-9]+).*/\1/')"
if [ -n "$MAJOR" ] && [ "$MAJOR" -lt 18 ]; then
  echo "!! Need Node 18+. Got $NODE_VER — try: pkg install nodejs-lts"
  exit 1
fi

echo "==> Clone / update repo"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull --ff-only || git -C "$REPO_DIR" pull
else
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"

echo "==> npm install"
npm install

if [ "${SKIP_TTS:-0}" != "1" ]; then
  echo "==> Optional TTS (edge-tts) for Video tab"
  pip install --user edge-tts 2>/dev/null || pip install edge-tts || {
    echo "!! edge-tts install failed — Video TTS may fall back. Continuing."
  }
fi

if [ ! -f .env.local ] && [ -f .env.local.example ]; then
  cp .env.local.example .env.local
  echo "==> Created .env.local from example (mock/$0 mode)"
fi

echo ""
echo "Ready."
echo "  Chat/Personas/Automation mock: open http://127.0.0.1:${PORT}"
echo "  Fanvue OAuth (HTTPS) is awkward on phones — use a PC/VPS for Live connect."
echo ""

if [ "${SKIP_RUN:-0}" = "1" ]; then
  echo "SKIP_RUN=1 — not starting. Later:"
  echo "  cd \"$REPO_DIR\" && npm run dev -- -H $HOST -p $PORT"
  exit 0
fi

echo "==> Starting Next.js on http://${HOST}:${PORT}"
echo "    Stop with Ctrl+C"
exec npm run dev -- -H "$HOST" -p "$PORT"
