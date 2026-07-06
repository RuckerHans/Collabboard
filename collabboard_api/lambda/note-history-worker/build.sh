#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Assumes dependencies are already installed (npm ci / npm install --omit=dev).
rm -f function.zip
zip -r function.zip index.js node_modules -x '*.map' >/dev/null

echo "Built $(pwd)/function.zip"
