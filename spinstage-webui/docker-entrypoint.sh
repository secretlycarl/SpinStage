#!/bin/sh
set -eu

mkdir -p config

if [ ! -f config/user-settings.json ]; then
  python3 - <<'PY'
import sys
from pathlib import Path

sys.path.insert(0, str(Path("scripts")))
from ma_settings_common import load_env_settings, write_settings

settings = load_env_settings()
if settings:
    write_settings(Path("config/user-settings.json"), settings)
PY
fi

exec python3 server.py --host 0.0.0.0 --port "${SPINSTAGE_PORT:-9728}"
