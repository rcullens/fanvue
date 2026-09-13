#!/data/data/com.termux/files/usr/bin/bash
# One-shot: ensure SWC WASM patch, then run Next on Termux.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash scripts/termux-fix-swc.sh
set -a
# shellcheck disable=SC1091
source .termux-next.env
set +a
export NEXT_SWC_WASM=1
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3000}"
echo "==> next dev http://${HOST}:${PORT} (WASM SWC)"
exec npm run dev -- -H "$HOST" -p "$PORT"
