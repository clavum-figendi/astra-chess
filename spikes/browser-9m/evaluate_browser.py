# Copyright 2026 Chess Lab contributors.
# DeepMind searchless_chess architecture/token contract: Apache License 2.0.
# Published DeepMind weights: CC-BY 4.0.
"""Evaluate the selected browser candidate on validation positions using Chromium."""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
STAGING = Path(os.environ.get("ASTRA_BROWSER_STAGING", "/home/hermes/.hermes/cache/scratch/astra-browser/staging"))
CHROME = os.environ.get(
    "ASTRA_CHROMIUM",
    "/home/hermes/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell",
)
VALIDATION_PATH = REPO / ".cache" / "deepmind-v5" / "validation.json"
PYTHON_EVAL = REPO / "evaluation" / "v0.6" / "python-onnx-evaluation.json"


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
    parser.add_argument("--variant", default="fp16-storage")
    parser.add_argument("--output", default=REPO / "evaluation/v0.6/browser-onnx-evaluation.json", type=Path)
    args = parser.parse_args()

    rows = json.loads(VALIDATION_PATH.read_text())
    python_eval = json.loads(PYTHON_EVAL.read_text())
    selected = python_eval["selected"]
    if selected != args.variant:
        raise ValueError(f"Variant mismatch: Python selected {selected}, browser asked for {args.variant}")

    url = args.url
    server = None
    if not url:
        server = serve(STAGING, args.port)
        url = f"http://127.0.0.1:{args.port}/"

    errors = []
    results = []
    started = time.perf_counter()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=CHROME)
        page = browser.new_page(viewport={"width": 1280, "height": 1000})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url, wait_until="networkidle")
        page.evaluate(
            """async ({ variant }) => {
                const { loadTransformer } = await import('./src/transformer.mjs');
                const file = variant === 'fp16-storage' ? 'deepmind-9m-fp16.onnx' : `deepmind-9m-${variant}.onnx`;
                const modelUrl = new URL('./models/' + file, location.href);
                const metadata = {
                    architecture: 'deepmind-9m-action-value',
                    runtime: { type: 'onnx', batchSize: 4 },
                    config: { max_sequence_length: 79, output_size: 128 },
                    variant,
                };
                const response = await fetch(modelUrl);
                const buffer = await response.arrayBuffer();
                window.__model = await loadTransformer(buffer, metadata);
            }""",
            {"variant": args.variant},
        )
        page.wait_for_function("window.__model", timeout=120000)
        for row in rows:
            result = page.evaluate(
                """async ({ fen }) => {
                    const { chooseTransformerMove } = await import('./src/transformer.mjs');
                    return await chooseTransformerMove(fen, window.__model);
                }""",
                {"fen": row["fen"]},
            )
            results.append({
                "id": row["id"],
                "fen": row["fen"],
                "top": result["move"],
                "teacherBest": row["teacher"][0]["move"] if row["teacher"] else None,
            })
        browser.close()

    if server:
        server.shutdown()

    elapsed = time.perf_counter() - started
    agreements = sum(r["top"] == p["top"] for r, p in zip(results, python_eval["referenceResults"]))
    teacher_hits = sum(r["top"] == r["teacherBest"] for r in results if r["teacherBest"])
    receipt = {
        "variant": args.variant,
        "url": url,
        "staging": str(STAGING),
        "chromium": CHROME,
        "positions": len(results),
        "agreements": agreements,
        "agreementRate": agreements / len(results),
        "teacherHits": teacher_hits,
        "inferenceSeconds": elapsed,
        "errors": errors,
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
