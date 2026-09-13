#!/data/data/com.termux/files/usr/bin/bash
# Fix Next.js on Termux (android/arm64).
#
# Next lists android in its platform triples, so experimental.useWasmBinary is
# often IGNORED — then it tries to download @next/swc-android-arm64 (404) and dies.
# We:
#   1) pin next@14.2.33
#   2) install @next/swc-wasm-nodejs
#   3) patch next/dist/build/swc/index.js to force WASM-first when NEXT_SWC_WASM=1
#   4) remove any native android SWC dirs
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET_NEXT="14.2.33"

echo "==> Termux SWC fix (force WASM-first)"
echo "    platform=$(node -p process.platform 2>/dev/null || echo unknown) arch=$(node -p process.arch 2>/dev/null || echo unknown)"

CUR="$(node -p "require('./node_modules/next/package.json').version" 2>/dev/null || echo none)"
echo "    current next=$CUR"
if [ "$CUR" != "$TARGET_NEXT" ]; then
  echo "==> Installing next@$TARGET_NEXT"
  npm install "next@$TARGET_NEXT" "eslint-config-next@$TARGET_NEXT"
fi

NEXT_VER="$(node -p "require('./node_modules/next/package.json').version")"
echo "    using next@$NEXT_VER"

echo "==> Removing native SWC packages (glibc / missing android builds)"
rm -rf \
  node_modules/@next/swc-android-arm64 \
  node_modules/@next/swc-linux-arm64-gnu \
  node_modules/@next/swc-linux-arm64-musl \
  node_modules/next/next-swc-fallback \
  || true

echo "==> Installing @next/swc-wasm-nodejs@$NEXT_VER (--force)"
npm install --force --no-save --no-package-lock "@next/swc-wasm-nodejs@$NEXT_VER"
node -e "require('@next/swc-wasm-nodejs'); console.log('    wasm package OK')"

echo "==> Patching Next to force WASM-first on Termux"
python3 << 'PY'
from pathlib import Path

def patch(path: Path) -> str:
    if not path.exists():
        return f"missing {path}"
    t = path.read_text()
    marker = "NEXT_SWC_WASM_FORCE_PATCH"
    if marker in t:
        return f"already patched {path}"

    old = "const shouldLoadWasmFallbackFirst = !disableWasmFallback && unsupportedPlatform && useWasmBinary || isWebContainer;"
    new = (
        "const shouldLoadWasmFallbackFirst = /* NEXT_SWC_WASM_FORCE_PATCH */ "
        "!disableWasmFallback && (unsupportedPlatform && useWasmBinary || isWebContainer "
        '|| process.platform === "android" || process.env.NEXT_SWC_WASM === "1");'
    )
    if old not in t:
        # esm build uses slightly different formatting sometimes
        old2 = "const shouldLoadWasmFallbackFirst = !disableWasmFallback && unsupportedPlatform && useWasmBinary || isWebContainer;"
        if old2 not in t:
            return f"PATTERN NOT FOUND in {path}"
    t = t.replace(old, new, 1)

    # Don't ignore useWasmBinary when we force it
    old_warn = (
        "if (!unsupportedPlatform && useWasmBinary) {\n"
        "            _log.warn(`experimental.useWasmBinary is not an option for supported platform ${PlatformName}/${ArchName} and will be ignored.`);\n"
        "        }"
    )
    new_warn = (
        "if (!unsupportedPlatform && useWasmBinary && process.platform !== \"android\" && process.env.NEXT_SWC_WASM !== \"1\") {\n"
        "            _log.warn(`experimental.useWasmBinary is not an option for supported platform ${PlatformName}/${ArchName} and will be ignored.`);\n"
        "        }"
    )
    # esm uses Log.warn
    old_warn_esm = old_warn.replace("_log.warn", "Log.warn")
    new_warn_esm = new_warn.replace("_log.warn", "Log.warn")
    if old_warn in t:
        t = t.replace(old_warn, new_warn, 1)
    elif old_warn_esm in t:
        t = t.replace(old_warn_esm, new_warn_esm, 1)

    path.write_text(t)
    return f"patched {path}"

for rel in [
    "node_modules/next/dist/build/swc/index.js",
    "node_modules/next/dist/esm/build/swc/index.js",
]:
    print("   ", patch(Path(rel)))
PY

echo "NEXT_SWC_WASM=1" > .termux-next.env
echo "    wrote .termux-next.env"

echo ""
echo "Done. Start with:"
echo "  bash scripts/termux-dev.sh"
