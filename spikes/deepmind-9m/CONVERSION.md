# DeepMind 9M BC: safe tensor conversion, semantic compatibility BLOCKED

## Status

**All 94 source tensors (8,930,992 float32 parameters) import strictly and run in
PyTorch. Exact equivalence to the released model is NOT established.** The
archive contains a Flax-named parameter tree, whereas both public revisions of
the official model use Haiku. The available source and the archive also disagree
on input vocabulary and positional-table shapes. Do not call NumPy parity below
“original checkpoint parity”, and do not treat a candidate head adaptation as a
verified fine-tune of the original forward computation.

No training/optimizer steps, test-label access, engine subprocesses, remote
writes, commits, or publication were performed. A backward-only gradient smoke
check did not alter parameters. The source functions executed by contract tests
were first read/reviewed in full; tests AST-select only the two pure contract
functions, excluding imports and unrelated upstream code. No upstream model or
checkpoint Python code was executed. No JAX/Flax install was attempted.

## Provenance and rights

- Weights: Google DeepMind, *searchless_chess*, `9M_behavioral_cloning.zip`,
  [official download script](https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/checkpoints/download.sh).
- Local archive: `.cache/research/9M_behavioral_cloning.zip`, **33,094,721 bytes**.
- SHA-256: `b23bb4615c8c27f1945d689ae639af030a70c42fc7ff2a71e3da4db7b29784ff`.
- Official [README license statements](https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/README.md):
  code Apache-2.0; weights **CC-BY-4.0** (https://creativecommons.org/licenses/by/4.0/).
- Contract implementation follows DeepMind's tokenizer/action enumeration;
  copyright notices are retained in `model.py`. Independent PyTorch equations,
  conversion, tests, and CLI are Chess Lab modifications, Apache-2.0:
  https://www.apache.org/licenses/LICENSE-2.0 . No endorsement is implied.
- Local converted file is a modified representation, not an original official
  artifact: `.cache/research/deepmind-9m-candidate.pt` (**35,754,305 bytes**).
  It records attribution and `official_semantics_verified: false`.
  Do not distribute without preserving attribution, source and license links,
  and indicating modifications. Weights are not embedded in source files.

## Source investigation and unresolved facts

Inspected official revision `90ae0e6b121673fc3079aaeffa047580bb600c0a` and initial
revision `d5aab18b59c84f2defc71673b3e76d517b0cff2c`. GitHub's commit history for
`src/transformer.py` contains only these two revisions; **both use Haiku**.
The public repository tree does not supply a matching Flax model. The archive's
`_METADATA` JSON and `checkpoint` MessagePack contain parameter paths/placeholders;
`_sharding` JSON describes placement. None provides forward semantic constants.
These files were decoded as data only, never unpickled/executed.

| Question | Evidence | What is actually established |
|---|---|---|
| Right shift / embedding scaling | [transformer.py](https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/transformer.py), lines 183–184, 208–212, 257–261 | Current Haiku code right-shifts with BOS 0 and multiplies token embeddings by sqrt(width), i.e. 16 for width 256. Not proof of released Flax behavior. |
| Noncausal attention | [engine constants](https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/engines/constants.py), predictor_config | Explicit `use_causal_mask=False`, but factory hardcodes action-value, not a matching BC release config. Notebook also sets False for a small local model. |
| Norm epsilon | transformer.py `layer_norm` does not pass eps; [Haiku v0.0.12 LayerNorm](https://github.com/google-deepmind/dm-haiku/blob/v0.0.12/haiku/_src/layer_norm.py) defaults to 1e-5 | Public requirements do not pin Haiku. Original Flax epsilon is absent. A candidate 1e-6 is a common Flax default, **not a recovered training constant**. |
| Input embedding | Actual tensor is `[31,256]` | Published engine factory specifies `vocab_size=NUM_ACTIONS=1968`, incompatible with this checkpoint, not merely a key rename. |
| Positional embedding | Actual tensor is `[78,256]` | Factory specifies FEN77+2=79, incompatible with this checkpoint. 78 fits BC FEN77+one target. |
| Block architecture | Eight MHA sets; 24 bias-free MLP matrices in triplets; 17 LN scale/bias pairs; Dense24 head | Fits 8 pre-LN attention+SwiGLU blocks and final LN, but does not encode gate operand ordering, normalization epsilon, embedding scaling or mask. |

**Blocker:** obtain the original matching Flax implementation/config and a trusted
reference-logit fixture or executable reference. Without it, mask, scale, norm
semantics and gate interpretation are assumptions. A sensible opening move alone
is not evidence of compatibility. We deliberately require explicit semantic
constants and an experimental opt-in rather than silently declaring a conversion
valid. Candidate currently saved uses eps=1e-6, embedding_scale=16, bidirectional
attention, sequential pre-LN residuals, and SiLU(first MLP projection) times second.
Current Haiku-derived eps=1e-5 is a separate unverified candidate, not a fix.

## Safe import and exact contracts

- TensorStore directly opens OCDBT/Zarr arrays. Does not invoke Orbax restore,
  pickle, or arbitrary metadata deserialization.
- Full required key set, exact shape, float32 dtype and finite contents are
  checked. Extra/missing tensors and incorrect shapes fail. All 94 tensors map
  one-to-one; PyTorch state restoration is strict.
- Q/K/V `[256,8,32]` reshape `[256,256]` then transpose to Linear layout;
  attention output `[8,32,256]` likewise flattens heads before transposition.
- Official **absolute** FEN77 contract, with literal 31-character alphabet,
  right-padded clock digits, compressed castling string right-padded to four,
  two en-passant characters; no perspective flip, side renormalization or clock
  clipping. `encode_fens` appends dummy 0; the model right-shifts internally.
- Action order matches **all 1,968 IDs** against reviewed official `utils.py`,
  including queen destinations before knight destinations and both-color
  promotions in exact `q,r,b,n` suffix order. Castling uses ordinary UCI king moves.
- `rank_legal` uses python-chess legality, lexicographic tie breaking and a softmax
  restricted to legal moves. No engine/search. Terminal boards return an empty
  list; probabilities of an already-ended claimable game are not special-cased.
- Tensor-only local checkpoint loading uses `torch.load(weights_only=True)` and
  strict state loading. Saving is restricted to paths containing `.cache`.

## API for parent orchestration

```python
# Add spikes/deepmind-9m to sys.path; use .cache/learning-venv/bin/python.
from model import (Semantics, load_official, encode_fens, move_index,
                   rank_legal, save_converted, load_converted)
model, report = load_official(
    '.cache/research/weights/9M_behavioral_cloning',
    semantics=Semantics(layer_norm_eps=1e-6, embedding_scale=16.0))
tokens = encode_fens(fens)                 # int64 [B,78], not already shifted
features = model.forward_features(tokens) # final normalized [B,256]
logits = model(tokens)                    # raw [B,1968]
assert model.head.in_features == 256 and model.head.out_features == 1968
# model.head is nn.Linear; model(tokens) == model.head(features).
# Cache features only under a fixed documented candidate/checkpoint fingerprint.
```

`forward(..., return_all=True)` returns all 78 positions for numerical testing.
`return_trace=True` also returns named intermediate tensors. `load_official`
without explicit semantics fails. `load_converted` requires
`allow_experimental=True`. These guards must not be removed to imply verification.
**Do not begin the proposed fresh-label/head-adaptation run as a verified original
model fine-tune until the semantic blocker is resolved or the user explicitly
accepts an exploratory candidate.**

## Executed verification

TDD: initial contract/import/features/CLI tests were run failing before their
corresponding implementation. Subsequent robustness/reference tests were added.

```sh
OPENBLAS_NUM_THREADS=1 PYTHONPATH=spikes/deepmind-9m \
  .cache/learning-venv/bin/python spikes/deepmind-9m/tests.py
```

Result: **5 tests passed**. Includes complete action-ID reference equality;
FEN fixtures with side, castling, EP and multi-digit clocks; all parameter shape/
count checks; mismatch refusal; legal moves/terminal position; finite backward
gradients without update; feature/head equality; local save and tensor-only
restore equality; CLI refusal/opt-in; independent NumPy forward parity.

Independent reference: raw source tensors (no PyTorch mapping/forward), NumPy
float64 einsums and explicit equations, **3 positions × 78 positions/sequence ×
1,968 output logits**, with **18 intermediate traces** (embedding, attention and
block residuals, final norm). Measured maximum fp64 logit discrepancy
`7.815970093361102e-13`, maximum fp64 trace discrepancy
`7.867129170335829e-11`. Float32 max absolute full-logit discrepancy vs NumPy
`0.00042456331721663076` (last-token logits max `0.00010817545966457232`);
last-token argmax IDs agree on all three fixtures. Fp32 residual streams reach
about 10,000, so strict trace comparisons run in float64. These are **candidate
implementation parity**, NOT independent original-model parity.

```sh
OPENBLAS_NUM_THREADS=1 .cache/learning-venv/bin/python spikes/deepmind-9m/cli.py \
  --checkpoint .cache/research/weights/9M_behavioral_cloning \
  --allow-experimental --layer-norm-eps 1e-6 --embedding-scale 16 \
  --save .cache/research/deepmind-9m-candidate.pt --top 5
```

Starting-position output (candidate, legal-normalized probabilities): e2e4
0.4611499, b2b4 0.2132219, b2b3 0.1246440, f2f4 0.1112204, h2h4 0.0326921.
These are smoke outputs, not a quality/compatibility claim. Runtime dependency
`python-chess==1.999` / `chess==1.11.2` was installed via `uv` into the existing
learning venv; it lacked pip. No large dependency install or extra weight download.
