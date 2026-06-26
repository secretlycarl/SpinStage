#!/usr/bin/env bash
cd "$(dirname "$0")"
python3 scripts/ensure_user_settings.py
python3 server.py "$@"
