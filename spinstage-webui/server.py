#!/usr/bin/env python3
"""SpinStage web UI — static file server with local user-settings persistence."""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import socket
import socketserver
import sys
import webbrowser
from pathlib import Path

PORT = 9728
HOST = "0.0.0.0"
ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"
USER_SETTINGS_PATH = ROOT / "config" / "user-settings.json"

if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from ma_settings_common import normalize_settings, write_settings  # noqa: E402


class SendspinHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
    }

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory or str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(f"[sendspin] {self.address_string()} - {fmt % args}\n")

    def _client_is_local(self) -> bool:
        host = self.client_address[0]
        return host in ("127.0.0.1", "::1", "localhost")

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/api/user-settings":
            self.send_error(404)
            return
        if not self._client_is_local():
            self.send_error(403, "user-settings API is localhost only")
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        try:
            raw = self.rfile.read(length).decode("utf-8")
            data = json.loads(raw) if raw else {}
            payload = normalize_settings({
                "server": data.get("server", ""),
                "playerName": data.get("playerName", ""),
                "username": data.get("username", ""),
                "password": data.get("password", ""),
            })
            write_settings(USER_SETTINGS_PATH, payload)
        except SystemExit as exc:
            self.send_error(400, str(exc))
            return
        except (json.JSONDecodeError, UnicodeDecodeError, TypeError, ValueError) as exc:
            self.send_error(400, f"invalid JSON: {exc}")
            return
        body = json.dumps({"ok": True}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the SpinStage web UI")
    parser.add_argument("--host", default=HOST, help=f"Bind address (default: {HOST})")
    parser.add_argument("--port", type=int, default=PORT, help=f"Port (default: {PORT})")
    parser.add_argument("--open", action="store_true", help="Open browser on startup")
    args = parser.parse_args()

    os.chdir(ROOT)
    handler = functools.partial(SendspinHandler, directory=str(ROOT))

    with socketserver.TCPServer((args.host, args.port), handler) as httpd:
        lan = local_ip()
        print("SpinStage web UI")
        print(f"  Local:   http://127.0.0.1:{args.port}/")
        print(f"  Network: http://{lan}:{args.port}/")
        print("Press Ctrl+C to stop.")

        if args.open:
            webbrowser.open(f"http://127.0.0.1:{args.port}/")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
