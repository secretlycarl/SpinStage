#!/usr/bin/env python3
"""Create config/user-settings.json for the browser webui."""

from __future__ import annotations

import argparse
from pathlib import Path

from ma_settings_common import normalize_settings, prompt, prompt_settings, write_settings

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "config" / "user-settings.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Create webui config/user-settings.json")
    parser.add_argument("--server", help="MA server hostname or IP")
    parser.add_argument("--player", help="MA player name for this device")
    parser.add_argument("--username", help="MA account username")
    parser.add_argument("--password", help="MA account password")
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
    print("\nRun: ./run.sh --open")


if __name__ == "__main__":
    main()
