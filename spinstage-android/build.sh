#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 scripts/ensure_user_settings.py
npm install
npm run build:debug
