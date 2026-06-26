#!/usr/bin/env python3
"""Stage platform-local user-settings.json before sync/package (repo convenience wrapper)."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

PLATFORM_DIRS = {
    "webui": REPO / "spinstage-webui",
    "android": REPO / "spinstage-android",
    "webos": REPO / "spinstage-webos",
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Stage platform-local user-settings.json before build/package"
    )
    parser.add_argument("platform", choices=tuple(PLATFORM_DIRS))
    parser.add_argument("--quiet", action="store_true", help="Skip output when no config exists")
    args = parser.parse_args()

    if args.platform == "webui":
        raise SystemExit(
            "webui does not use inject_user_settings — use config/user-settings.json or Connect screen."
        )

    script = PLATFORM_DIRS[args.platform] / "scripts" / "inject_user_settings.py"
    if not script.is_file():
        raise SystemExit(f"Missing platform script: {script}")

    cmd = [sys.executable, str(script)]
    if args.quiet:
        cmd.append("--quiet")
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
