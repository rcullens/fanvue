/** @type {import('next').NextConfig} */
const useWasm =
  process.env.NEXT_SWC_WASM === "1" || process.platform === "android";

const nextConfig = {
  // Termux/Android: no official @next/swc-android-arm64 for Next 14 — use WASM SWC.
  ...(useWasm ? { experimental: { useWasmBinary: true } } : {}),
};

export default nextConfig;
