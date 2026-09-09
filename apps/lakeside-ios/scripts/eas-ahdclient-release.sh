#!/bin/bash
set -euo pipefail
umask 077

app_root=$(pwd)
repo_root=$(cd ../.. && pwd)
private_dir=$(mktemp -d)
key_dir="$HOME/.appstoreconnect/private_keys"

cleanup() {
  rm -rf "$private_dir" "$key_dir" "$repo_root/apps/desktop/src-tauri/gen/apple/build"
}
trap cleanup EXIT

for variable in APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_CONTENT APPLE_DEVELOPMENT_TEAM; do
  if [ -z "${!variable:-}" ]; then
    echo "Missing private release variable: $variable" >&2
    exit 1
  fi
done

cd "$repo_root"
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  . "$HOME/.cargo/env"
fi
rustup toolchain install stable --profile minimal
rustup default stable
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
npm ci
npm run release:check
npm run typecheck
npm test --workspace apps/desktop

if [ ! -d apps/desktop/src-tauri/gen/apple ]; then
  npm run tauri --workspace apps/desktop -- ios init --ci
fi
ruby scripts/configure-ios-widgets.rb
npm run tauri --workspace apps/desktop -- icon src/assets/ahd-logo.png --ios-color '#ffffff'
icon=apps/desktop/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
test -s "$icon"
sips -s format jpeg "$icon" --out "$private_dir/AHDClient-app-icon.jpg"
sips -s format png "$private_dir/AHDClient-app-icon.jpg" --out "$icon"
sips -g hasAlpha "$icon" | grep -q 'hasAlpha: no'

export APPLE_API_KEY_PATH="$private_dir/AuthKey_${APPLE_API_KEY}.p8"
python3 - <<'PY'
import base64
import os
from pathlib import Path

content = os.environ['APPLE_API_KEY_CONTENT'].strip()
key = content.encode() if content.startswith('-----BEGIN PRIVATE KEY-----') else base64.b64decode(''.join(content.split()), validate=True)
path = Path(os.environ['APPLE_API_KEY_PATH'])
path.write_bytes(key)
path.chmod(0o600)
PY

export RUNNER_TEMP="$private_dir"
python3 scripts/private-apple-command.py npm run tauri --workspace apps/desktop -- ios build --export-method app-store-connect
ipa=$(find apps/desktop/src-tauri/gen/apple/build/arm64 -type f -name '*.ipa' -print -quit)
test -n "$ipa"
python3 scripts/verify-ios-widget-bundle.py "$ipa"
mkdir -p "$key_dir"
cp "$APPLE_API_KEY_PATH" "$key_dir/AuthKey_${APPLE_API_KEY}.p8"
python3 scripts/private-apple-command.py xcrun altool --upload-app --type ios --file "$ipa" --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER"
cd "$app_root"
echo 'AHDClient uploaded to Apple. Processing is pending.'
