# Downloaded DeepMind 9M policy checkpoint: inspection

The official `9M_behavioral_cloning.zip` was downloaded from
https://storage.googleapis.com/searchless_chess/checkpoints/9M_behavioral_cloning.zip.
The official repository README explicitly licenses model weights under CC-BY 4.0 and code under Apache-2.0. Derivatives require attribution and identification of changes.

Archive: 33,094,721 bytes.
SHA-256: `b23bb4615c8c27f1945d689ae639af030a70c42fc7ff2a71e3da4db7b29784ff`.

## Actual tensor inspection

Unlike the source-loader contract summarized in the separate literature report, this particular archive contains a root-level Orbax OCDBT/Zarr checkpoint, with **Flax-style parameter names**. It was inspected through TensorStore metadata; no external pickle or model code was executed.

- Actual stored parameter count: **8,930,992** float32 scalar values.
- Token embedding: **31 × 256**.
- Learned positional embedding: **78 × 256**.
- Eight attention blocks, eight heads, head dimension 32.
- Q/K/V kernels: **256 × 8 × 32**; output kernels: **8 × 32 × 256**.
- Eight gated MLPs: two **256 × 1,024** matrices and one **1,024 × 256** matrix each.
- Seventeen LayerNorm scale/bias pairs.
- Final policy projection: **256 × 1,968**, plus bias.

The published decoder-style source uses pre-normalization and SwiGLU; released-engine configuration disables causal masking. Exact tokenizer, action IDs, embedding scaling, positional behavior and normalization must be preserved in conversion. Shape agreement alone does not establish numerical equivalence.

Local metadata: `.cache/research/checkpoint-shapes.json`.
Acquisition/license receipt: `spikes/deepmind-9m/provenance.json`.
The mismatch between the downloaded tree and the current public Haiku loader is under investigation before fine-tuning; no verified imported inference or strength result is claimed by this inspection record.
