#!/usr/bin/env python3
"""Collect GitHub Release artifacts for SpinStage.

Creates a versioned webui zip and optionally copies/renames built APK and IPK
into a single output folder (outside the git tree by default).

Usage (from Public/):

  python3 scripts/package_release.py

After building platform packages:

  cd spinstage-android && npm run build:release
  cd spinstage-webos && npm run package

  python3 scripts/package_release.py \\
    --apk spinstage-android/dist/spinstage-<version>.apk \\
    --ipk spinstage-webos/com.spinstage_0.9.9_all.ipk
"""

from __future__ import annotations

import argparse
import shutil
import zipfile
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1]
WEBUI = PUBLIC / "spinstage-webui"
VERSION_FILE = WEBUI / "VERSION"
DEFAULT_OUT = PUBLIC.parent / "release-artifacts"

SKIP_NAMES = {
    "user-settings.json",
    ".DS_Store",
    "Thumbs.db",
}


def read_version() -> str:
    text = VERSION_FILE.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit(f"Empty version in {VERSION_FILE}")
    return text


def should_skip(path: Path) -> bool:
    return path.name in SKIP_NAMES or path.name.startswith(".")


def zip_webui(out_dir: Path, version: str) -> Path:
    dest = out_dir / f"spinstage-webui-{version}.zip"
    out_dir.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()

    prefix = "spinstage-webui"
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(WEBUI.rglob("*")):
            if not path.is_file() or should_skip(path):
                continue
            arcname = f"{prefix}/{path.relative_to(WEBUI).as_posix()}"
            zf.write(path, arcname)
    return dest


def copy_artifact(src: Path, dest: Path) -> Path:
    if not src.is_file():
        raise SystemExit(f"Missing file: {src}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description="Package SpinStage release artifacts")
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output directory (default: {DEFAULT_OUT})",
    )
    parser.add_argument("--apk", type=Path, help="Path to built release APK")
    parser.add_argument("--ipk", type=Path, help="Path to built webOS IPK")
    args = parser.parse_args()

    version = read_version()
    out_dir = args.out.resolve()
    print(f"SpinStage {version} → {out_dir}")

    webui_zip = zip_webui(out_dir, version)
    print(f"  webui: {webui_zip.name}")

    if args.apk:
        apk_dest = out_dir / f"spinstage-{version}.apk"
        copy_artifact(args.apk.resolve(), apk_dest)
        print(f"  android: {apk_dest.name}")

    if args.ipk:
        ipk_dest = out_dir / f"com.spinstage_{version}_all.ipk"
        copy_artifact(args.ipk.resolve(), ipk_dest)
        print(f"  webos: {ipk_dest.name}")

    if not args.apk or not args.ipk:
        print()
        print("Build and attach remaining artifacts:")
        if not args.apk:
            print("  cd spinstage-android && npm run build:release")
            print(f"  … then re-run with --apk spinstage-android/dist/spinstage-{version}.apk")
        if not args.ipk:
            print("  cd spinstage-webos && npm run package")
            print(f"  … then re-run with --ipk …/com.spinstage_{version}_all.ipk")


if __name__ == "__main__":
    main()
