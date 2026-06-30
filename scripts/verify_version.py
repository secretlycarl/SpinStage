#!/usr/bin/env python3
"""Ensure VERSION and platform package metadata agree."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from version_utils import version_code_for

REPO = Path(__file__).resolve().parent.parent
WEBUI = REPO / "spinstage-webui"
VERSION_FILE = WEBUI / "VERSION"
ANDROID_GRADLE = REPO / "spinstage-android" / "android" / "app" / "build.gradle"
WEBOS_APPINFO = REPO / "spinstage-webos" / "appinfo.json"
PACKAGE_JSONS = (
    REPO / "spinstage-android" / "package.json",
    REPO / "spinstage-webos" / "package.json",
    REPO / "spinstage-tizen" / "package.json",
)
TIZEN_CONFIG = REPO / "spinstage-tizen" / "config.xml"


def read_version() -> str:
    text = VERSION_FILE.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit(f"Empty version in {VERSION_FILE}")
    return text


def main() -> int:
    version = read_version()
    expected_code = version_code_for(version)
    errors: list[str] = []

    for pkg_path in PACKAGE_JSONS:
        if not pkg_path.is_file():
            errors.append(f"Missing {pkg_path.relative_to(REPO)}")
            continue
        data = json.loads(pkg_path.read_text(encoding="utf-8"))
        if data.get("version") != version:
            errors.append(
                f"{pkg_path.relative_to(REPO)} version {data.get('version')!r} != {version!r}"
            )

    if WEBOS_APPINFO.is_file():
        data = json.loads(WEBOS_APPINFO.read_text(encoding="utf-8"))
        if data.get("version") != version:
            errors.append(
                f"{WEBOS_APPINFO.relative_to(REPO)} version {data.get('version')!r} != {version!r}"
            )
    else:
        errors.append(f"Missing {WEBOS_APPINFO.relative_to(REPO)}")

    if TIZEN_CONFIG.is_file():
        text = TIZEN_CONFIG.read_text(encoding="utf-8")
        version_match = re.search(r'<widget[^>]*\sversion="([^"]+)"', text)
        if not version_match or version_match.group(1) != version:
            found = version_match.group(1) if version_match else "<missing>"
            errors.append(f"{TIZEN_CONFIG.relative_to(REPO)} version {found!r} != {version!r}")
    else:
        errors.append(f"Missing {TIZEN_CONFIG.relative_to(REPO)}")

    if ANDROID_GRADLE.is_file():
        gradle = ANDROID_GRADLE.read_text(encoding="utf-8")
        name_match = re.search(r'versionName\s+"([^"]+)"', gradle)
        code_match = re.search(r"versionCode\s+(\d+)", gradle)
        if not name_match or name_match.group(1) != version:
            found = name_match.group(1) if name_match else "<missing>"
            errors.append(f"build.gradle versionName {found!r} != {version!r}")
        if not code_match or int(code_match.group(1)) != expected_code:
            found = code_match.group(1) if code_match else "<missing>"
            errors.append(
                f"build.gradle versionCode {found!r} != expected {expected_code} for {version}"
            )
    else:
        errors.append(f"Missing {ANDROID_GRADLE.relative_to(REPO)}")

    if errors:
        print("verify_version FAILED:\n")
        for err in errors:
            print(f"  • {err}")
        return 1

    print(f"OK — version {version} (versionCode {expected_code}) is consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
