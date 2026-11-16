# Copyright 2026 Chess Lab contributors.
# DeepMind searchless_chess architecture/token contract: Apache License 2.0.
# Published DeepMind weights: CC-BY 4.0.
"""Evaluate float32 PyTorch reference and ONNX variants on validation set.

Computes one rank per position under a strict single-threaded budget, then
stores all candidate top moves for the predeclared selection rule.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np
import onnxruntime as ort
import torch

REPO = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO / "spikes" / "deepmind-9m"
EVAL_DIR = REPO / "evaluation" / "v0.6"
VALIDATION_PATH = REPO / ".cache" / "deepmind-v5" / "validation.json"

ADAPTED_SHA256 = "05a434c6925312fc02323c3015d187d78016cef6ecc6485bbc9da0fcc4d3d264"
VARIANT_FILES = {
    "float32": "deepmind-9m-float32.onnx",
    "int8-dynamic": "deepmind-9m-int8-dynamic.onnx",
    "fp16-storage": "deepmind-9m-fp16.onnx",
}


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def rank_rows(model, session, rows, batch_size=4):
    results = []
    sys.path[:0] = [str(SOURCE_DIR)]
    import action_value
    import chess

    for row in rows:
        board = chess.Board(row["fen"])
        legal = sorted(move.uci() for move in board.legal_moves)
        if not legal:
            continue
        values = []
        for start in range(0, len(legal), batch_size):
            chunk = legal[start:start + batch_size]
            tokens = action_value.encode_state_actions(board.fen(), [chess.Move.from_uci(move) for move in chunk])
            with torch.no_grad():
                if session:
                    logits = session.run(None, {"tokens": tokens.numpy()})[0]
                    logits = np.asarray(logits, dtype=np.float32)
                else:
                    logits = model(tokens).numpy()
            expected = action_value.expected_values(torch.from_numpy(logits)).tolist()
            values.extend(expected)
        adjusted = dict(zip(legal, values))
        for move in legal:
            board.push(chess.Move.from_uci(move))
            if board.is_fivefold_repetition() or board.can_claim_threefold_repetition():
                adjusted[move] = 0.5
            board.pop()
        ranked = sorted(adjusted.items(), key=lambda item: (-float(item[1]), item[0]))
        top = ranked[0][0]
        results.append({
            "id": row["id"],
            "fen": row["fen"],
            "top": top,
            "teacherBest": row["teacher"][0]["move"] if row["teacher"] else None,
        })
    return results


def compare(candidate, reference, teacher_hits_reference):
    if len(candidate) != len(reference):
        raise ValueError("Mismatched result lengths")
    agreements = sum(c["top"] == r["top"] for c, r in zip(candidate, reference))
    total = len(reference)
    teacher_hits = sum(row["top"] == row["teacherBest"] for row in candidate if row["teacherBest"])
    return {
        "agreements": agreements,
        "agreementRate": agreements / total,
        "teacherHits": teacher_hits,
        "teacherDelta": teacher_hits - teacher_hits_reference,
    }


def select(variants, teacher_reference):
    eligible = []
    for name, result in variants.items():
        comparison = result["comparison"]
        if comparison["agreementRate"] >= 0.95 and comparison["teacherDelta"] >= -2:
            eligible.append((result["bytes"], name))
    if eligible:
        _, selected = min(eligible)
        return selected, "smallest eligible candidate satisfying the predeclared validation rule"
    if "fp16-storage" in variants:
        return "fp16-storage", "fallback after no candidate met the predeclared rule"
    return "float32", "fallback after no candidate met the predeclared rule"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=4)
    args = parser.parse_args()
    torch.set_num_threads(1)

    rows = json.loads(VALIDATION_PATH.read_text())
    assert len(rows) == 207

    sys.path[:0] = [str(SOURCE_DIR)]
    import action_value

    model_path = REPO / ".cache" / "deepmind-v5" / "adapted.pt"
    model, metadata = action_value.load_converted(model_path)
    assert sha256(model_path) == ADAPTED_SHA256

    reference = rank_rows(model, None, rows, args.batch_size)
    teacher_reference = sum(row["top"] == row["teacherBest"] for row in reference if row["teacherBest"])

    providers = ["CPUExecutionProvider"]
    session_options = ort.SessionOptions()
    session_options.intra_op_num_threads = 1
    session_options.inter_op_num_threads = 1
    session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    variants = {}
    for name, filename in VARIANT_FILES.items():
        path = REPO / "public" / "models" / filename
        if not path.exists():
            continue
        session = ort.InferenceSession(str(path), session_options, providers=providers)
        started = time.perf_counter()
        rows_evaluated = rank_rows(None, session, rows, args.batch_size)
        elapsed = time.perf_counter() - started
        variants[name] = {
            "file": path.name,
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
            "comparison": compare(rows_evaluated, reference, teacher_reference),
            "inferenceSeconds": elapsed,
            "positions": len(rows_evaluated),
        }

    selected_name, selected_reason = select(variants, teacher_reference)
    receipt = {
        "reference": {
            "file": model_path.name,
            "sha256": ADAPTED_SHA256,
            "teacherHits": teacher_reference,
            "positions": len(reference),
        },
        "variants": variants,
        "selected": selected_name,
        "selectionReason": selected_reason,
        "batchSize": args.batch_size,
        "threads": 1,
        "referenceResults": reference,
    }
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    (EVAL_DIR / "python-onnx-evaluation.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
