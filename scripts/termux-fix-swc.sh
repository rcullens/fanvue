#!/data/data/com.termux/files/usr/bin/bash
# Fix Next.js on Termux (android/arm64): no @next/swc-android-arm64 for Next 14+.
# Strategy:
#  1) Pin/ensure next@14.2.33 (last 14.2 with published SWC packages)
#  2) Prefer linux-arm64-gnu aliased as android-arm64
#  3) Else install @next/swc-wasm-nodejs and force WASM via NEXT_SWC_WASM=1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET_NEXT="14.2.33"

echo "==> Termux SWC fix"
echo "    platform=$(node -p process.platform) arch=$(node -p process.arch)"

# Ensure a Next version that actually has SWC packages on npm
CUR="$(node -p "require('./node_modules/next/package.json').version" 2>/dev/null || echo none)"
echo "    current next=$CUR"
if [ "$CUR" != "$TARGET_NEXT" ]; then
  echo "==> Installing next@$TARGET_NEXT (SWC packages exist for this version)"
  npm install next@$TARGET_NEXT eslint-config-next@$TARGET_NEXT
fi

NEXT_VER="$(node -p "require('./node_modules/next/package.json').version")"
echo "    using next@$NEXT_VER"

PLATFORM="$(node -p process.platform)"
if [ "$PLATFORM" != "android" ]; then
  echo "    Not android — done"
  exit 0
fi

alias_linux_swc() {
  local src="$1"
  local dest="node_modules/@next/swc-android-arm64"
  [ -d "$src" ] || return 1
  echo "==> Aliasing $src → $dest"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -a "$src"/. "$dest"/
  if [ -f "$DEST/package.json" ] || [ -f "$dest/package.json" ]; then
    node -e "
      const fs=require('fs');
      const p='$dest/package.json';
      const j=JSON.parse(fs.readFileSync(p,'utf8'));
      j.name='@next/swc-android-arm64';
      fs.writeFileSync(p, JSON.stringify(j,null,2));
    "
  fi
  return 0
}

echo "==> Try @next/swc-linux-arm64-gnu@$NEXT_VER"
if npm install --no-save --no-package-lock "@next/swc-linux-arm64-gnu@$NEXT_VER"; then
  if alias_linux_swc node_modules/@next/swc-linux-arm64-gnu; then
    echo "    Native linux-arm64 alias OK"
    # still write helper env file for wasm if needed later
    echo "NEXT_SWC_WASM=0" > .termux-next.env
    exit 0
  fi
fi

echo "==> Fallback: WASM SWC @next/swc-wasm-nodejs@$NEXT_VER"
npm install --no-save --no-package-lock "@next/swc-wasm-nodejs@$NEXT_VER"
# Ensure config path: env forces useWasmBinary in next.config.mjs
echo "NEXT_SWC_WASM=1" > .termux-next.env
echo "    WASM ready. Start with:"
echo "      set -a; source .termux-next.env; set +a"
echo "      npm run dev -- -H 0.0.0.0 -p 3000"
