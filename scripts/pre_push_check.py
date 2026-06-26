#!/usr/bin/env python3
"""Pre-push checks: secrets, gitignored config, and common leak patterns."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

SECRET_PATH_GLOBS = (
    "**/config/user-settings.json",
    "**/local.properties",
    ".env",
    ".env.*",
)

# Paths we scan for suspicious content (tracked source only).
SCAN_SUFFIXES = {".json", ".js", ".html", ".py", ".md", ".gradle", ".xml", ".properties", ".bat", ".sh", ".ps1"}

# Allow placeholders in examples/docs.
ALLOW_PATH_SUBSTRINGS = (
    "user-settings.json.example",
    "README.md",
    "INSTALL.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "pre_push_check.py",
    "THIRD_PARTY.md",
)

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("JWT-like token (eyJ…)", re.compile(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.")),
    ("Hardcoded apiToken key", re.compile(r'"apiToken"\s*:\s*"[^"]{8,}"')),
    (
        "user-settings.json with password (non-example)",
        re.compile(r'"password"\s*:\s*"[^"\s][^"]{2,}"'),
    ),
]


def _git_available() -> bool:
    try:
        subprocess.run(
            ["git", "rev-parse", "--git-dir"],
            cwd=REPO,
            capture_output=True,
            check=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def check_gitignored_secrets_staged() -> list[str]:
    errors: list[str] = []
    if not _git_available():
        return errors
    for pattern in SECRET_PATH_GLOBS:
        for path in REPO.glob(pattern):
            if not path.is_file():
                continue
            rel = path.relative_to(REPO).as_posix()
            result = subprocess.run(
                ["git", "diff", "--cached", "--name-only", "--", rel],
                cwd=REPO,
                capture_output=True,
                text=True,
            )
            if result.stdout.strip():
                errors.append(f"Staged secret file: {rel}")
    return errors


def check_tracked_secret_files() -> list[str]:
    errors: list[str] = []
    if not _git_available():
        return errors
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=True,
    )
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.endswith("config/user-settings.json") or line.endswith("/user-settings.json"):
            if not line.endswith(".example"):
                errors.append(f"Tracked file that should be gitignored: {line}")
        if line.endswith("local.properties"):
            errors.append(f"Tracked file that should be gitignored: {line}")
    return errors


def _should_scan(path: Path) -> bool:
    if path.suffix.lower() not in SCAN_SUFFIXES:
        return False
    rel = path.as_posix()
    if any(part in rel for part in ("node_modules", ".gradle", "/build/", "__pycache__")):
        return False
    if any(allow in rel for allow in ALLOW_PATH_SUBSTRINGS):
        return False
    return True


def scan_tree_for_patterns() -> list[str]:
    errors: list[str] = []
    for path in REPO.rglob("*"):
        if not path.is_file() or not _should_scan(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        rel = path.relative_to(REPO).as_posix()
        for label, pattern in PATTERNS:
            if pattern.search(text):
                errors.append(f"{label} in {rel}")
    return errors


def iter_webui_runtime_files() -> list[Path]:
    """All canonical webui files copied to android/webos by sync_public_platforms.py."""
    webui = REPO / "spinstage-webui"
    files: list[Path] = []
    for name in ("app", "styles"):
        root = webui / name
        if root.is_dir():
            files.extend(
                p for p in sorted(root.rglob("*"))
                if p.is_file() and "user-settings.json" not in p.name
            )
    for name in (
        "index.html",
        "sendspin-lib.js",
        "VERSION",
        "favicon.png",
        "favicon-32.png",
        "icon.png",
    ):
        path = webui / name
        if path.is_file():
            files.append(path)
    icons = webui / "icons"
    if icons.is_dir():
        files.extend(p for p in sorted(icons.rglob("*")) if p.is_file())
    config = webui / "config"
    if config.is_dir():
        files.extend(
            p for p in sorted(config.rglob("*"))
            if p.is_file() and p.name != "user-settings.json"
        )
    return files


def _platform_root_label(root: Path) -> str:
    rel = root.relative_to(REPO).as_posix()
    return rel


def should_compare_runtime_file(root: Path, rel_posix: str) -> bool:
    label = _platform_root_label(root)
    if label == "spinstage-webos" and rel_posix in {"app/constants.js", "app/platform.js"}:
        return False
    if rel_posix == "index.html" and label.startswith("spinstage-android/"):
        return False
    return True


def check_webos_runtime_patches() -> list[str]:
    errors: list[str] = []
    constants = REPO / "spinstage-webos" / "app" / "constants.js"
    platform_js = REPO / "spinstage-webos" / "app" / "platform.js"
    if constants.is_file():
        text = constants.read_text(encoding="utf-8")
        if "export const IS_WEBOS = true;" not in text:
            errors.append("webOS constants.js missing IS_WEBOS = true patch")
    else:
        errors.append("Missing spinstage-webos/app/constants.js")
    if platform_js.is_file():
        text = platform_js.read_text(encoding="utf-8")
        if "return IS_WEBOS || IS_ANDROID;" not in text:
            errors.append("webOS platform.js missing useTieredFocus patch")
    else:
        errors.append("Missing spinstage-webos/app/platform.js")
    return errors


def check_android_index_links() -> list[str]:
    errors: list[str] = []
    # assets/public is Capacitor output (gitignored); www is the tracked Android web tree.
    for root in (REPO / "spinstage-android" / "www",):
        index_path = root / "index.html"
        if not index_path.is_file():
            errors.append(f"Missing {index_path.relative_to(REPO)}")
            continue
        html = index_path.read_text(encoding="utf-8")
        if 'href="styles/platform-android.css"' not in html:
            errors.append(f"{index_path.relative_to(REPO)} missing platform-android.css link")
    return errors


def check_platform_trees_synced() -> list[str]:
    """Android/webOS copies must match canonical spinstage-webui after edits."""
    errors: list[str] = []
    errors.extend(check_webos_runtime_patches())
    errors.extend(check_android_index_links())
    platform_roots = (
        REPO / "spinstage-android" / "www",
        REPO / "spinstage-webos",
    )
    for rel in iter_webui_runtime_files():
        rel_posix = rel.relative_to(REPO / "spinstage-webui").as_posix()
        src = rel
        for root in platform_roots:
            if not should_compare_runtime_file(root, rel_posix):
                continue
            dest = root / rel_posix
            if not dest.is_file():
                errors.append(f"Missing platform copy: {dest.relative_to(REPO)}")
                continue
            if dest.read_bytes() != src.read_bytes():
                errors.append(
                    f"Platform copy out of sync with spinstage-webui — run "
                    f"python3 scripts/sync_public_platforms.py ({dest.relative_to(REPO)})"
                )
    return errors


def main() -> int:
    print(f"Pre-push check: {REPO}")
    errors: list[str] = []
    errors.extend(check_tracked_secret_files())
    errors.extend(check_gitignored_secrets_staged())
    errors.extend(check_platform_trees_synced())
    errors.extend(scan_tree_for_patterns())

    if errors:
        print("\nFAILED — resolve before push:\n")
        for err in errors:
            print(f"  • {err}")
        print("\nSee CONTRIBUTING.md and SECURITY.md.")
        return 1

    print("OK — no common secret patterns or staged credential files found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
