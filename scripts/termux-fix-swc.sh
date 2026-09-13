#!/data/data/com.termux/files/usr/bin/bash
# Fix Next.js on Termux (android/arm64).
#
# Do NOT use @next/swc-linux-*-gnu — it needs glibc (libc.so.6) and Android is bionic.
# Only WASM works: @next/swc-wasm-nodejs + experimental.useWasmBinary / NEXT_SWC_WASM=1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET_NEXT="14.2.33"

echo "==> Termux SWC fix (WASM only — no glibc binaries)"
echo "    platform=$(node -p process.platform 2>/dev/null || echo unknown) arch=$(node -p process.arch 2>/dev/null || echo unknown)"

CUR="$(node -p "require('./node_modules/next/package.json').version" 2>/dev/null || echo none)"
echo "    current next=$CUR"
if [ "$CUR" != "$TARGET_NEXT" ]; then
  echo "==> Installing next@$TARGET_NEXT"
  npm install "next@$TARGET_NEXT" "eslint-config-next@$TARGET_NEXT"
fi

NEXT_VER="$(node -p "require('./node_modules/next/package.json').version")"
echo "    using next@$NEXT_VER"

# Remove any native android/linux SWC packages that will crash on bionic
echo "==> Removing native SWC packages that break on Android/bionic"
rm -rf \
  node_modules/@next/swc-android-arm64 \
  node_modules/@next/swc-linux-arm64-gnu \
  node_modules/@next/swc-linux-arm64-musl \
  || true

echo "==> Installing @next/swc-wasm-nodejs@$NEXT_VER (--force)"
npm install --force --no-save --no-package-lock "@next/swc-wasm-nodejs@$NEXT_VER"

# Prove the package is there
node -e "require('@next/swc-wasm-nodejs'); console.log('    wasm package loads OK')"

echo "NEXT_SWC_WASM=1" > .termux-next.env
echo "    wrote .termux-next.env"

echo ""
echo "Done. Start with:"
echo "  set -a; source .termux-next.env; set +a"
echo "  npm run dev -- -H 0.0.0.0 -p 3000"
