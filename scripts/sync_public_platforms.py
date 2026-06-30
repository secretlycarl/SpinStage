#!/usr/bin/env python3
"""Sync canonical spinstage-webui tree to Android (www + assets), webOS, and Tizen."""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from version_utils import version_code_for

REPO = Path(__file__).resolve().parent.parent
WEBUI = REPO / "spinstage-webui"
ANDROID_WWW = REPO / "spinstage-android" / "www"
ANDROID_ASSETS = (
    REPO / "spinstage-android" / "android" / "app" / "src" / "main" / "assets" / "public"
)
WEBOS = REPO / "spinstage-webos"
TIZEN = REPO / "spinstage-tizen"
TIZEN_CONFIG = TIZEN / "config.xml"
ANDROID_CSS_SRC = Path(__file__).resolve().parent / "sync-assets" / "platform-android.css"

WEBUI_RUNTIME_NAMES = (
    "app",
    "styles",
    "index.html",
    "sendspin-lib.js",
    "favicon.png",
    "favicon-32.png",
    "icon.png",
    "icons",
    "config",
    "VERSION",
)

STALE_RUNTIME_NAMES = (
    "Vibrant.min.js",
)

ANDROID_INDEX_LINK = '    <link rel="stylesheet" href="styles/platform-android.css">\n'
ANDROID_INDEX_ANCHOR = '    <link rel="stylesheet" href="styles/platform-webos.css">\n'

TIZEN_INDEX_LINK = '    <link rel="stylesheet" href="styles/platform-tizen.css">\n'
TIZEN_INDEX_ANCHOR = '    <link rel="stylesheet" href="styles/platform-webos.css">\n'

WEBOS_CONSTANTS_MARKER = "SYNC-WEBOS:IS_WEBOS"
WEBOS_TIERED_MARKER = "SYNC-WEBOS:USE_TIERED_FOCUS"

TIZEN_CONSTANTS_MARKER = "SYNC-TIZEN:IS_TIZEN"
TIZEN_TIERED_MARKER = "SYNC-TIZEN:USE_TIERED_FOCUS"

WEBOS_CONSTANTS_OLD = "export const IS_WEBOS = typeof webOS !== 'undefined';"
WEBOS_CONSTANTS_NEW = f"export const IS_WEBOS = true; // {WEBOS_CONSTANTS_MARKER}"

WEBOS_TIERED_OLD = """export function useTieredFocus() {
    if (IS_WEBOS || IS_TIZEN || IS_ANDROID) return true;
    return !IS_CAPACITOR;
}"""

WEBOS_TIERED_NEW = f"""export function useTieredFocus() {{
    return IS_WEBOS || IS_ANDROID;
}} // {WEBOS_TIERED_MARKER}"""

TIZEN_CONSTANTS_OLD = "export const IS_TIZEN = false;"
TIZEN_CONSTANTS_NEW = f"export const IS_TIZEN = true; // {TIZEN_CONSTANTS_MARKER}"

TIZEN_TIERED_OLD = WEBOS_TIERED_OLD
TIZEN_TIERED_NEW = f"""export function useTieredFocus() {{
    return IS_TIZEN || IS_ANDROID;
}} // {TIZEN_TIERED_MARKER}"""

CONTROLS_BTN_RULE = "#controls-container .btn { pointer-events: auto; }"
WEBOS_TV_HINT_RULE = "body.webos-tv .panel-hint {"
TIZEN_TV_HINT_RULE = "body.tizen-tv .panel-hint {"


def _remove_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    elif path.is_file():
        path.unlink()


def _prune_stale_runtime(dest: Path) -> None:
    for name in STALE_RUNTIME_NAMES:
        p = dest / name
        if p.is_file():
            p.unlink()


def _copy_webui_runtime(src: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for name in WEBUI_RUNTIME_NAMES:
        s = src / name
        if not s.exists():
            continue
        d = dest / name
        if d.exists():
            _remove_path(d)
        if s.is_dir():
            shutil.copytree(
                s,
                d,
                ignore=shutil.ignore_patterns("user-settings.json", "__pycache__", "*.pyc"),
            )
        else:
            shutil.copy2(s, d)


def patch_android_index(html: str) -> str:
    if ANDROID_INDEX_LINK.strip() in html:
        return html
    if ANDROID_INDEX_ANCHOR not in html:
        raise SystemExit("Android index anchor not found in webui index.html")
    return html.replace(ANDROID_INDEX_ANCHOR, ANDROID_INDEX_ANCHOR + ANDROID_INDEX_LINK, 1)


def patch_tizen_index(html: str) -> str:
    if TIZEN_INDEX_LINK.strip() in html:
        return html
    if TIZEN_INDEX_ANCHOR not in html:
        raise SystemExit("Tizen index anchor not found in webui index.html")
    return html.replace(TIZEN_INDEX_ANCHOR, TIZEN_INDEX_ANCHOR + TIZEN_INDEX_LINK, 1)


def patch_marker_line(text: str, marker: str, replacement: str, legacy_old: str | None = None) -> str:
    pattern = re.compile(rf"^.+// {re.escape(marker)}.*$", re.MULTILINE)
    if pattern.search(text):
        return pattern.sub(replacement, text, count=1)
    if legacy_old and legacy_old in text:
        return text.replace(legacy_old, replacement, 1)
    return text


def patch_webos_js(webui_root: Path) -> None:
    constants = webui_root / "app" / "constants.js"
    text = constants.read_text(encoding="utf-8")
    patched = patch_marker_line(
        text,
        WEBOS_CONSTANTS_MARKER,
        WEBOS_CONSTANTS_NEW,
        WEBOS_CONSTANTS_OLD,
    )
    if patched == text:
        raise SystemExit("webOS constants patch anchor missing in app/constants.js")
    constants.write_text(patched, encoding="utf-8")

    platform_js = webui_root / "app" / "platform.js"
    text = platform_js.read_text(encoding="utf-8")
    tiered_pattern = re.compile(
        rf"export function useTieredFocus\(\) \{{.*?// {re.escape(WEBOS_TIERED_MARKER)}",
        re.DOTALL,
    )
    if tiered_pattern.search(text):
        patched = tiered_pattern.sub(WEBOS_TIERED_NEW, text, count=1)
    else:
        patched = patch_marker_line(
            text,
            WEBOS_TIERED_MARKER,
            WEBOS_TIERED_NEW,
            WEBOS_TIERED_OLD,
        )
    if patched == text:
        raise SystemExit("webOS useTieredFocus patch anchor missing in app/platform.js")
    platform_js.write_text(patched, encoding="utf-8")


def patch_tizen_js(webui_root: Path) -> None:
    constants = webui_root / "app" / "constants.js"
    text = constants.read_text(encoding="utf-8")
    patched = patch_marker_line(
        text,
        TIZEN_CONSTANTS_MARKER,
        TIZEN_CONSTANTS_NEW,
        TIZEN_CONSTANTS_OLD,
    )
    if patched == text:
        raise SystemExit("Tizen constants patch anchor missing in app/constants.js")
    constants.write_text(patched, encoding="utf-8")

    platform_js = webui_root / "app" / "platform.js"
    text = platform_js.read_text(encoding="utf-8")
    tiered_pattern = re.compile(
        rf"export function useTieredFocus\(\) \{{.*?// {re.escape(WEBOS_TIERED_MARKER)}",
        re.DOTALL,
    )
    if tiered_pattern.search(text):
        patched = tiered_pattern.sub(TIZEN_TIERED_NEW, text, count=1)
    else:
        patched = patch_marker_line(
            text,
            TIZEN_TIERED_MARKER,
            TIZEN_TIERED_NEW,
            TIZEN_TIERED_OLD,
        )
    if patched == text:
        raise SystemExit("Tizen useTieredFocus patch anchor missing in app/platform.js")
    platform_js.write_text(patched, encoding="utf-8")


def validate_android_css(css: str) -> None:
    if "body.touch-ui.show-ui:not(.panel-open) #controls-container" not in css:
        raise SystemExit("Android CSS missing portrait controls rules")


def validate_android_tree(webui_root: Path) -> None:
    base_css = (webui_root / "styles" / "base.css").read_text(encoding="utf-8")
    if CONTROLS_BTN_RULE not in base_css:
        raise SystemExit(f"base.css missing {CONTROLS_BTN_RULE!r}")


def validate_webos_css(webui_root: Path) -> None:
    css = (webui_root / "styles" / "platform-webos.css").read_text(encoding="utf-8")
    if WEBOS_TV_HINT_RULE not in css:
        raise SystemExit(f"webOS CSS missing {WEBOS_TV_HINT_RULE!r}")


def validate_tizen_css(webui_root: Path) -> None:
    css = (webui_root / "styles" / "platform-tizen.css").read_text(encoding="utf-8")
    if TIZEN_TV_HINT_RULE not in css:
        raise SystemExit(f"Tizen CSS missing {TIZEN_TV_HINT_RULE!r}")


def sync_platform_tree(dest: Path, *, android: bool, webos: bool, tizen: bool) -> None:
    if not WEBUI.is_dir():
        raise SystemExit(f"Canonical webui missing: {WEBUI}")

    _copy_webui_runtime(WEBUI, dest)
    _prune_stale_runtime(dest)

    index_path = dest / "index.html"
    index_html = index_path.read_text(encoding="utf-8")

    if android:
        if not ANDROID_CSS_SRC.is_file():
            raise SystemExit(f"Missing Android CSS asset: {ANDROID_CSS_SRC}")
        android_css = ANDROID_CSS_SRC.read_text(encoding="utf-8")
        validate_android_css(android_css)
        (dest / "styles" / "platform-android.css").write_text(android_css, encoding="utf-8")
        index_path.write_text(patch_android_index(index_html), encoding="utf-8")
        validate_android_tree(dest)

    if webos:
        patch_webos_js(dest)
        validate_webos_css(dest)

    if tizen:
        patch_tizen_js(dest)
        index_path.write_text(patch_tizen_index(index_html), encoding="utf-8")
        validate_tizen_css(dest)


def sync_android() -> None:
    sync_platform_tree(ANDROID_WWW, android=True, webos=False, tizen=False)
    sync_platform_tree(ANDROID_ASSETS, android=True, webos=False, tizen=False)


def sync_webos() -> None:
    sync_platform_tree(WEBOS, android=False, webos=True, tizen=False)


def sync_tizen() -> None:
    sync_platform_tree(TIZEN, android=False, webos=False, tizen=True)


def sync_ma_settings_common() -> None:
    src = WEBUI / "scripts" / "ma_settings_common.py"
    if not src.is_file():
        return
    for dest_root in (
        REPO / "scripts",
        REPO / "spinstage-android" / "scripts",
        REPO / "spinstage-webos" / "scripts",
        REPO / "spinstage-tizen" / "scripts",
    ):
        dest_root.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest_root / "ma_settings_common.py")


def sync_platform_versions(version: str) -> None:
    if not version:
        return
    version_code = version_code_for(version)
    webos_appinfo = WEBOS / "appinfo.json"
    if webos_appinfo.is_file():
        data = json.loads(webos_appinfo.read_text(encoding="utf-8"))
        data["version"] = version
        webos_appinfo.write_text(f"{json.dumps(data, indent=4)}\n", encoding="utf-8")
    for pkg_path in (
        WEBOS / "package.json",
        TIZEN / "package.json",
        REPO / "spinstage-android" / "package.json",
    ):
        if not pkg_path.is_file():
            continue
        data = json.loads(pkg_path.read_text(encoding="utf-8"))
        data["version"] = version
        pkg_path.write_text(f"{json.dumps(data, indent=2)}\n", encoding="utf-8")
    build_gradle = REPO / "spinstage-android" / "android" / "app" / "build.gradle"
    if build_gradle.is_file():
        text = build_gradle.read_text(encoding="utf-8")
        text, name_count = re.subn(
            r'versionName\s+"[^"]+"',
            f'versionName "{version}"',
            text,
            count=1,
        )
        text, code_count = re.subn(
            r"versionCode\s+\d+",
            f"versionCode {version_code}",
            text,
            count=1,
        )
        if name_count != 1 or code_count != 1:
            raise SystemExit("Failed to patch android/app/build.gradle version fields")
        build_gradle.write_text(text, encoding="utf-8")
    if TIZEN_CONFIG.is_file():
        text = TIZEN_CONFIG.read_text(encoding="utf-8")
        text, count = re.subn(
            r'(<widget[^>]*\sversion=")[^"]+(")',
            rf'\g<1>{version}\2',
            text,
            count=1,
        )
        if count != 1:
            raise SystemExit("Failed to patch spinstage-tizen/config.xml version")
        TIZEN_CONFIG.write_text(text, encoding="utf-8")


def main() -> None:
    version = (WEBUI / "VERSION").read_text(encoding="utf-8").strip() if (WEBUI / "VERSION").is_file() else ""
    sync_platform_versions(version)
    sync_ma_settings_common()
    sync_android()
    sync_webos()
    sync_tizen()
    print(
        f"Synced modular webui{f' v{version}' if version else ''} "
        f"-> android (www + assets), webos, and tizen"
    )


if __name__ == "__main__":
    main()
