#!/data/data/com.termux/files/usr/bin/bash
# Recommended Termux path: run Fanvue studio inside Ubuntu (proot-distro).
# Real linux/glibc → official @next/swc-linux-arm64-gnu works. No WASM hacks.
set -euo pipefail

echo "==> Fanvue via proot Ubuntu"
pkg update -y
pkg install -y proot-distro curl

if ! proot-distro list 2>/dev/null | grep -qi ubuntu; then
  echo "==> Installing Ubuntu distro (one-time, can take a few minutes)"
  proot-distro install ubuntu
fi

echo "==> Launching Ubuntu. Inside the Ubuntu shell, paste:"
cat << 'INNER'

apt update
apt install -y git curl ca-certificates python3 ffmpeg
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v

cd ~
if [ -d fanvue/.git ]; then
  cd fanvue && git pull
else
  git clone https://github.com/rcullens/fanvue.git fanvue
  cd fanvue
fi

npm install
npm run dev -- -H 0.0.0.0 -p 3000

# Then on Android browser: http://127.0.0.1:3000
INNER

echo ""
echo "Starting login now…"
exec proot-distro login ubuntu --bind ~/fanvue:/root/fanvue-host:rw
