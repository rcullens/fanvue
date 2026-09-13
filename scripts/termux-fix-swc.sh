#!/data/data/com.termux/files/usr/bin/bash
# Next.js does not publish @next/swc-android-arm64. On Termux (android/arm64),
# alias the linux arm64 SWC binary so `next dev` can start.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NEXT_VER="$(node -p "require('./node_modules/next/package.json').version" 2>/dev/null || true)"
if [ -z "$NEXT_VER" ]; then
  echo "!! next not installed — run npm install first"
  exit 1
fi

PLATFORM="$(node -p process.platform)"
ARCH="$(node -p process.arch)"
echo "==> Termux SWC fix (next@$NEXT_VER platform=$PLATFORM arch=$ARCH)"

if [ "$PLATFORM" != "android" ]; then
  echo "    Not android — nothing to do"
  exit 0
fi

# Prefer gnu linux arm64 binary (works on most Termux aarch64 devices)
PKG="@next/swc-linux-arm64-gnu@$NEXT_VER"
ALT="@next/swc-linux-arm64-musl@$NEXT_VER"

echo "==> Installing $PKG"
if ! npm install --no-save --no-package-lock "$PKG" 2>/dev/null; then
  echo "==> gnu failed, trying musl $ALT"
  npm install --no-save --no-package-lock "$ALT" || {
    echo "!! Could not install linux arm64 SWC. Trying wasm fallback…"
    npm install --no-save --no-package-lock "@next/swc-wasm-nodejs@$NEXT_VER" || true
  }
fi

SRC=""
for cand in \
  node_modules/@next/swc-linux-arm64-gnu \
  node_modules/@next/swc-linux-arm64-musl
do
  if [ -d "$cand" ]; then SRC="$cand"; break; fi
done

DEST="node_modules/@next/swc-android-arm64"
if [ -n "$SRC" ]; then
  echo "==> Aliasing $SRC → $DEST"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  # copy contents so Next's require('@next/swc-android-arm64') resolves
  cp -a "$SRC"/. "$DEST"/
  # rewrite package name if package.json exists
  if [ -f "$DEST/package.json" ]; then
    node -e "
      const fs=require('fs');
      const p='$DEST/package.json';
      const j=JSON.parse(fs.readFileSync(p,'utf8'));
      j.name='@next/swc-android-arm64';
      fs.writeFileSync(p, JSON.stringify(j,null,2));
    "
  fi
  echo "    OK — SWC android alias ready"
else
  echo "!! No linux SWC package found. next may still fail."
  exit 1
fi
