"""Shared helpers for SpinStage user-settings.json (MA login credentials)."""

from __future__ import annotations

import getpass
import json
import sys
from pathlib import Path

REQUIRED_KEYS = ("server", "playerName", "username", "password")


def prompt(label: str, *, secret: bool = False) -> str:
    if secret and sys.stdin.isatty():
        return getpass.getpass(f"{label}: ").strip()
    return input(f"{label}: ").strip()


def prompt_settings(*, server: str = "", player: str = "", username: str = "", password: str = "") -> dict:
    server = server or prompt("Music Assistant server (IP or hostname)")
    player = player or prompt("Player name for this device (check config in MA -> Players)")
    username = username or prompt("MA username")
    password = password or prompt("MA password", secret=True)
    return normalize_settings({
        "server": server,
        "playerName": player,
        "username": username,
        "password": password,
    })


def normalize_settings(data: dict) -> dict:
    missing = [key for key in REQUIRED_KEYS if not str(data.get(key, "")).strip()]
    if missing:
        raise SystemExit(f"user-settings missing required fields: {', '.join(missing)}")
    return {
        "server": str(data["server"]).strip(),
        "playerName": str(data["playerName"]).strip(),
        "username": str(data["username"]).strip(),
        "password": str(data["password"]),
    }


def load_env_settings() -> dict | None:
    import os

    server = (os.environ.get("SPINSTAGE_SERVER") or "").strip()
    player = (os.environ.get("SPINSTAGE_PLAYER") or "").strip()
    username = (os.environ.get("SPINSTAGE_USERNAME") or "").strip()
    password = (os.environ.get("SPINSTAGE_PASSWORD") or "").strip()
    if not any((server, player, username, password)):
        return None
    return normalize_settings({
        "server": server,
        "playerName": player,
        "username": username,
        "password": password,
    })


def write_settings(dest: Path, payload: dict) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
