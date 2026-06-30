#!/usr/bin/env python3
"""Prompt to create platform-local config/user-settings.json when missing."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

PLATFORM_DIRS = {
    "android": REPO / "spinstage-android",
    "webos": REPO / "spinstage-webos",
    "tizen": REPO / "spinstage-tizen-beta",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ensure user-settings.json exists")
    parser.add_argument("platform", choices=tuple(PLATFORM_DIRS))
    parser.add_argument("--force", action="store_true", help="Overwrite existing file")
    args = parser.parse_args()

    script = PLATFORM_DIRS[args.platform] / "scripts" / "ensure_user_settings.py"
    if not script.is_file():
        raise SystemExit(f"Missing platform script: {script}")

    cmd = [sys.executable, str(script)]
    if args.force:
        cmd.append("--force")
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
