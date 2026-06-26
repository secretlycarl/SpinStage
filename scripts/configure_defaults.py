#!/usr/bin/env python3
"""
Write user-settings.json for one SpinStage platform (repo convenience wrapper).

Each platform also ships scripts/configure_defaults.py for standalone use.
"""

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
        description="Create platform-local config/user-settings.json"
    )
    parser.add_argument(
        "--platform",
        required=True,
        choices=tuple(PLATFORM_DIRS),
        help="Which platform/device this build is for",
    )
    parser.add_argument("--server", help="MA server hostname or IP")
    parser.add_argument("--player", help="MA player name for this device")
    parser.add_argument("--username", help="MA account username")
    parser.add_argument("--password", help="MA account password")
    parser.add_argument(
        "--stage",
        action="store_true",
        help="Run inject_user_settings.py for this platform after writing",
    )
    args = parser.parse_args()

    script = PLATFORM_DIRS[args.platform] / "scripts" / "configure_defaults.py"
    if not script.is_file():
        raise SystemExit(f"Missing platform script: {script}")

    cmd = [sys.executable, str(script)]
    for flag, value in (
        ("--server", args.server),
        ("--player", args.player),
        ("--username", args.username),
        ("--password", args.password),
    ):
        if value is not None:
            cmd.extend([flag, value])
    if args.stage:
        cmd.append("--stage")
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
