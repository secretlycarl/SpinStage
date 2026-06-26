#!/usr/bin/env python3
"""Parse-check SpinStage webui ES modules before shipping."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WEBUI = REPO / "spinstage-webui"


def find_node() -> str | None:
    return shutil.which("node")


def find_esbuild() -> Path | None:
    candidates = (
        REPO / "spinstage-android" / "node_modules" / ".bin" / "esbuild",
        REPO / "spinstage-webos" / "node_modules" / ".bin" / "esbuild",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    npx = shutil.which("npx")
    if npx:
        return Path(npx)
    return None


def esbuild_bundle_check(esbuild: Path) -> tuple[int, str]:
    cmd = [
        str(esbuild),
        str(WEBUI / "app" / "main.js"),
        "--bundle",
        "--platform=browser",
        "--format=esm",
        "--outfile=/dev/null",
        "--log-level=warning",
    ]
    if esbuild.name == "npx":
        cmd = [str(esbuild), "--yes", "esbuild", *cmd[1:]]
    proc = subprocess.run(cmd, cwd=WEBUI, capture_output=True, text=True)
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, out.strip()


def node_import_check(node: str) -> tuple[int, str]:
    main_url = (WEBUI / "app" / "main.js").resolve().as_uri()
    proc = subprocess.run(
        [
            node,
            "--input-type=module",
            "-e",
            f"import('{main_url}').then(() => process.exit(0)).catch((err) => {{ console.error(err); process.exit(1); }})",
        ],
        cwd=WEBUI,
        capture_output=True,
        text=True,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, out.strip()


def main() -> int:
    print(f"verify_webui_js: {WEBUI.relative_to(REPO.parent)}")

    esbuild = find_esbuild()
    if esbuild:
        code, output = esbuild_bundle_check(esbuild)
        if code != 0:
            print("FAIL — esbuild bundle check:")
            print(output or "(no output)")
            return 1
        print("OK — webui JS bundles cleanly (esbuild)")
        return 0

    node = find_node()
    if not node:
        print("FAIL — Node.js is required (install Node 18+ and retry)")
        return 1

    code, output = node_import_check(node)
    if code != 0:
        print("FAIL — node import check:")
        print(output or "(no output)")
        print("Hint: run npm ci in spinstage-android for esbuild-based verification")
        return 1

    print("OK — webui JS parses cleanly (node import)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
