#!/usr/bin/env python3
"""Ensure packaged config/user-settings.json is present before ares-package."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from ma_settings_common import load_env_settings, normalize_settings, write_settings

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "config" / "user-settings.json"
DEST = ROOT / "config" / "user-settings.json"


def resolve_source() -> tuple[Path | None, dict | None]:
    explicit = (os.environ.get("SPINSTAGE_USER_SETTINGS") or "").strip()
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if not path.is_file():
            raise SystemExit(f"SPINSTAGE_USER_SETTINGS not found: {path}")
        return path, json.loads(path.read_text(encoding="utf-8"))

    if SOURCE.is_file():
        return SOURCE, json.loads(SOURCE.read_text(encoding="utf-8"))

    env_data = load_env_settings()
    if env_data is not None:
        return None, env_data

    return None, None


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage user-settings.json for webOS package")
    parser.add_argument("--quiet", action="store_true", help="Skip output when no config exists")
    args = parser.parse_args()

    source_path, raw = resolve_source()
    if raw is None:
        if not args.quiet:
            example = SOURCE.with_suffix(".json.example")
            print("[inject-user-settings] No config — skipping.")
            print(f"  Create config/user-settings.json (see {example.name}) or set SPINSTAGE_* env vars.")
        raise SystemExit(0)

    payload = normalize_settings(raw)
    write_settings(DEST, payload)
    origin = f" from {source_path.relative_to(ROOT)}" if source_path else " from environment"
    print(f"[inject-user-settings] Staged {DEST.relative_to(ROOT)}{origin}")


if __name__ == "__main__":
    main()
