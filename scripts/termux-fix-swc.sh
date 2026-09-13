#!/data/data/com.termux/files/usr/bin/bash
# Fix Next.js on Termux (android/arm64).
# npm refuses @next/swc-linux-* on os=android (EBADPLATFORM).
# We:
#   A) install @next/swc-wasm-nodejs with --force + NEXT_SWC_WASM=1
#   B) curl the linux-arm64-gnu tarball and alias it as @next/swc-android-arm64
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET_NEXT="14.2.33"

echo "==> Termux SWC fix"
echo "    platform=$(node -p process.platform 2>/dev/null || echo unknown) arch=$(node -p process.arch 2>/dev/null || echo unknown)"

CUR="$(node -p "require('./node_modules/next/package.json').version" 2>/dev/null || echo none)"
echo "    current next=$CUR"
if [ "$CUR" != "$TARGET_NEXT" ]; then
  echo "==> Installing next@$TARGET_NEXT"
  npm install "next@$TARGET_NEXT" "eslint-config-next@$TARGET_NEXT"
fi

NEXT_VER="$(node -p "require('./node_modules/next/package.json').version")"
echo "    using next@$NEXT_VER"

echo "==> Installing @next/swc-wasm-nodejs@$NEXT_VER (--force, bypass platform)"
npm install --force --no-save --no-package-lock "@next/swc-wasm-nodejs@$NEXT_VER"
echo "NEXT_SWC_WASM=1" > .termux-next.env
echo "    WASM OK → wrote .termux-next.env"

TMP="$(mktemp -d)"
TGZ="$TMP/swc.tgz"
URL="https://registry.npmjs.org/@next/swc-linux-arm64-gnu/-/swc-linux-arm64-gnu-${NEXT_VER}.tgz"
DEST="node_modules/@next/swc-android-arm64"

echo "==> Fetching linux SWC tarball (bypass npm os check)"
echo "    $URL"
if curl -fsSL "$URL" -o "$TGZ"; then
  rm -rf "$DEST"
  mkdir -p "$DEST"
  tar -xzf "$TGZ" -C "$DEST" --strip-components=1
  if [ -f "$DEST/package.json" ]; then
    node -e "
      const fs=require('fs');
      const p=process.argv[1];
      const j=JSON.parse(fs.readFileSync(p,'utf8'));
      j.name='@next/swc-android-arm64';
      delete j.os; delete j.cpu; delete j.libc;
      fs.writeFileSync(p, JSON.stringify(j,null,2));
    " "$DEST/package.json"
  fi
  echo "    Aliased → @next/swc-android-arm64"
else
  echo "!! tarball download failed — WASM-only may still work with NEXT_SWC_WASM=1"
fi
rm -rf "$TMP"

echo ""
echo "Done. Start with:"
echo "  set -a; source .termux-next.env; set +a"
echo "  npm run dev -- -H 0.0.0.0 -p 3000"
