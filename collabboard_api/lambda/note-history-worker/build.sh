#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

rm -rf node_modules function.zip
npm install --omit=dev

zip -r function.zip index.js node_modules -x '*.map' >/dev/null

echo "Built $(pwd)/function.zip"
