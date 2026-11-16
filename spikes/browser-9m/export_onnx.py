# Copyright 2026 Chess Lab contributors.
# DeepMind searchless_chess architecture/token contract: Apache License 2.0.
# Published DeepMind weights: CC-BY 4.0.
"""Convert the frozen adapted PyTorch checkpoint to browser ONNX artifacts.

Reads:
  .cache/research/deepmind-9m-action-value.pt
  .cache/deepmind-v5/adapted.pt
Writes only under public/models/ and evaluation/v0.6/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")

import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.tools.convert_onnx_models_to_ort import convert_onnx_models_to_ort

REPO = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO / "spikes" / "deepmind-9m"
MODELS_DIR = REPO / "public" / "models"
EVAL_DIR = REPO / "evaluation" / "v0.6"
ORT_VENDOR = REPO / "public" / "vendor" / "ort"

ADAPTED_SHA256 = "05a434c6925312fc02323c3015d187d78016cef6ecc6485bbc9da0fcc4d3d264"
ORIGINAL_SHA256 = "767a03340cf2362019eb724b2aaa4829bc0943b4c65b55bb4aa7f937a802bdf2"
BATCH_SIZE = 4


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load_model(path: Path, expected_sha: str):
    digest = sha256(path)
    if digest != expected_sha:
        raise ValueError(f"unexpected SHA-256 for {path}")
    import sys

    sys.path[:0] = [str(SOURCE_DIR)]
    import action_value

    model, metadata = action_value.load_converted(path)
    return model, metadata, digest


class OnnxWrapper(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, tokens: torch.Tensor) -> torch.Tensor:
        # ONNX graph returns full sequence; select last token after the export.
        return self.model(tokens, return_all=True)[:, -1, :]


def export_float32(model, output: Path) -> Path:
    wrapper = OnnxWrapper(model).eval()
    example = torch.zeros((BATCH_SIZE, 79), dtype=torch.long)
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        wrapper,
        (example,),
        str(output),
        input_names=["tokens"],
        output_names=["logits"],
        dynamic_axes={"tokens": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    onnx_model = onnx.load(str(output))
    onnx.checker.check_model(onnx_model)
    onnx.save(onnx_model, str(output), save_as_external_data=False)
    return output


def create_fp16_storage(source: Path, target: Path) -> Path:
    """Cast model initializers to float16, insert casts for WASM float32 execution."""
    model = onnx.load(str(source))
    graph = model.graph
    initializers = {init.name: init for init in graph.initializer}
    float32_names = [name for name, init in initializers.items() if init.data_type == onnx.TensorProto.FLOAT]
    # Convert weights to FP16 storage
    for name in float32_names:
        old = initializers.pop(name)
        array = onnx.numpy_helper.to_array(old).astype(np.float16)
        graph.initializer.remove(old)
        new_init = onnx.numpy_helper.from_array(array, name + "_fp16")
        graph.initializer.append(new_init)
        initializers[name + "_fp16"] = new_init
    # Insert Cast node before each consumer expecting float32
    node_index = 0
    while node_index < len(graph.node):
        node = graph.node[node_index]
        for index, input_name in enumerate(node.input):
            fp16_name = input_name + "_fp16"
            if input_name in float32_names and fp16_name in initializers:
                cast_output = f"{input_name}_cast_f32"
                cast_node = onnx.helper.make_node(
                    "Cast",
                    [fp16_name],
                    [cast_output],
                    name=f"cast_{input_name}_{node_index}",
                    to=onnx.TensorProto.FLOAT,
                )
                graph.node.insert(node_index, cast_node)
                node.input[index] = cast_output
                node_index += 1
        node_index += 1
    onnx.save(model, str(target))
    onnx.checker.check_model(target)
    return target


def quantize_int8(source: Path, target: Path) -> Path:
    quantize_dynamic(
        str(source),
        str(target),
        weight_type=QuantType.QUInt8,
        per_channel=True,
        reduce_range=False,
        op_types_to_quantize=["MatMul", "Gemm"],
        extra_options={"WeightSymmetric": True, "ActivationSymmetric": False},
    )
    onnx.checker.check_model(target)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", default=REPO / ".cache/deepmind-v5/adapted.pt", type=Path)
    parser.add_argument("--output-dir", default=MODELS_DIR, type=Path)
    parser.add_argument("--variant", choices=["float32", "int8", "fp16", "all"], default="float32")
    args = parser.parse_args()

    model, metadata, digest = load_model(args.checkpoint, ADAPTED_SHA256)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    float32_path = args.output_dir / "deepmind-9m-float32.onnx"
    export_float32(model, float32_path)
    variants = {"float32": float32_path}
    if args.variant in {"int8", "all"}:
        variants["int8"] = quantize_int8(float32_path, args.output_dir / "deepmind-9m-int8-dynamic.onnx")
    if args.variant in {"fp16", "all"}:
        variants["fp16"] = create_fp16_storage(float32_path, args.output_dir / "deepmind-9m-fp16.onnx")
    receipts = []
    for name, path in variants.items():
        receipts.append({
            "variant": name,
            "file": path.name,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "sourceSha256": digest,
        })
    receipt = {
        "checkpoint": str(args.checkpoint),
        "checkpointSha256": digest,
        "metadata": metadata,
        "batchSize": BATCH_SIZE,
        "variants": receipts,
    }
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    (EVAL_DIR / "onnx-export.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
