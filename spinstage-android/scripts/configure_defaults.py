#!/usr/bin/env python3
"""Create config/user-settings.json for this Android build target."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from ma_settings_common import normalize_settings, prompt, prompt_settings, write_settings

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "config" / "user-settings.json"
INJECT = Path(__file__).resolve().parent / "inject_user_settings.py"


def main() -> None:
    parser = argparse.ArgumentParser(description="Create Android config/user-settings.json")
    parser.add_argument("--server", help="MA server hostname or IP")
    parser.add_argument("--player", help="MA player name for this device")
    parser.add_argument("--username", help="MA account username")
    parser.add_argument("--password", help="MA account password")
    parser.add_argument(
        "--stage",
        action="store_true",
        help="Run inject_user_settings.py after writing",
    )
    args = parser.parse_args()

    if any((args.server, args.player, args.username, args.password)):
        payload = normalize_settings({
            "server": args.server or prompt("Music Assistant server (IP or hostname)"),
            "playerName": args.player or prompt("Player name for this device (check config in MA -> Players)"),
            "username": args.username or prompt("MA username"),
            "password": args.password or prompt("MA password", secret=True),
        })
    else:
        payload = prompt_settings()

    write_settings(DEST, payload)
    print(f"Wrote {DEST.relative_to(ROOT)}")
    print("Keep this file private. It is gitignored.")

    if args.stage:
        subprocess.run([sys.executable, str(INJECT)], check=True)
    else:
        print("\nBuild with defaults: npm run build:debug")
        print("Or stage now: python scripts/inject_user_settings.py")


if __name__ == "__main__":
    main()
