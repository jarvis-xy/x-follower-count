#!/bin/sh
# Zip extension/ for distribution or Chrome Web Store upload: dist/x-follower-count-v<version>.zip
set -e
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")
OUT="dist/x-follower-count-v$VERSION.zip"
mkdir -p dist
rm -f "$OUT"
(cd extension && zip -qr "../$OUT" . -x '.*' -x '*/.*')
echo "$OUT"
