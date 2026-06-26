#!/usr/bin/env python3
"""Prompt to create config/user-settings.json when missing (Android build helper)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ma_settings_common import prompt_settings, write_settings

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "config" / "user-settings.json"


def prompt_yes(default_yes: bool = True) -> bool:
    suffix = " [Y/n]: " if default_yes else " [y/N]: "
    ans = input(f"Create user-settings.json now?{suffix}").strip().lower()
    if not ans:
        return default_yes
    return ans in ("y", "yes")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ensure config/user-settings.json exists")
    parser.add_argument("--force", action="store_true", help="Overwrite existing file")
    args = parser.parse_args()

    if DEST.is_file() and not args.force:
        return

    if DEST.is_file() and args.force:
        print(f"Updating {DEST.relative_to(ROOT)}")
    else:
        print(f"No config at {DEST.relative_to(ROOT)}")
        if not sys.stdin.isatty():
            print("Non-interactive shell — skipping prompts.")
            return
        if not prompt_yes():
            return

    if not sys.stdin.isatty():
        raise SystemExit("Cannot prompt for settings in non-interactive mode.")

    payload = prompt_settings()
    write_settings(DEST, payload)
    print(f"Wrote {DEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
