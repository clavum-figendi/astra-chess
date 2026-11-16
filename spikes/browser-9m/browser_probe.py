"""Actual Chromium ORT-Web probe using the local executable."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
STAGING = Path(os.environ.get("ASTRA_BROWSER_STAGING", "/home/hermes/.hermes/cache/scratch/astra-browser/staging"))
CHROME = os.environ.get(
    "ASTRA_CHROMIUM",
    "/home/hermes/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell",
)


def serve(root: Path, port: int):
    import http.server
    import socketserver
    import threading

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def log_message(self, format, *args):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4192)
    parser.add_argument("--url", default=None)
    parser.add_argument("--output", default=REPO / "evaluation/v0.6/browser-probe.json", type=Path)
    args = parser.parse_args()

    url = args.url
    server = None
    if not url:
        server = serve(STAGING, args.port)
        url = f"http://127.0.0.1:{args.port}/"

    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=CHROME)
        page = browser.new_page(viewport={"width": 1280, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.goto(url, wait_until="networkidle")
        page.wait_for_function("window.__probeResult || window.__probeError", timeout=120000)
        result = page.evaluate("window.__probeResult")
        error = page.evaluate("window.__probeError")
        status = page.locator("#status").inner_text()
        browser.close()

    if server:
        server.shutdown()

    receipt = {
        "url": url,
        "staging": str(STAGING),
        "chromium": CHROME,
        "status": status,
        "result": result,
        "error": error,
        "pageErrors": errors,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    if error or errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
