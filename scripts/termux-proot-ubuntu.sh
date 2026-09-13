#!/data/data/com.termux/files/usr/bin/bash
# From Termux: ensure Ubuntu proot exists, then login.
# Inside Ubuntu, run the setup script (see message printed below).
set -euo pipefail

echo "==> Fanvue via proot Ubuntu"
pkg update -y
pkg install -y proot-distro curl

if ! proot-distro list 2>/dev/null | grep -qiE 'ubuntu[[:space:]].*(installed|OK)'; then
  # Fallback: try install; ignore "already exists"
  proot-distro install ubuntu 2>/dev/null || true
fi

echo ""
echo "Logging into Ubuntu."
echo "AFTER the Ubuntu prompt appears, run THIS one short line:"
echo ""
echo "  curl -fsSL https://raw.githubusercontent.com/rcullens/fanvue/main/scripts/ubuntu-setup-fanvue.sh | bash"
echo ""
exec proot-distro login ubuntu
