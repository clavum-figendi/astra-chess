# DeepMind 9M action-value: verified PyTorch conversion

## Outcome

The original **action-value** archive matches the official Haiku implementation.
All **94 tensors / 8,954,240 parameters** convert strictly and inference agrees
with an actual execution of the reviewed official transformer in JAX/Haiku.
This is a separate working import, not another assumed variant of the unresolved
Flax behavioral-cloning model. Existing BC files were not modified by this task.

Created only `action_value.py`, `tests_action_value.py`, and this document under
`spikes/deepmind-9m/`. Runtime artifacts stay under `.cache/research/`.
No training, optimizer updates, fresh dataset reads, test-label reads, engine
invocations, remote writes, commits or publication occurred. Backward-only tests
check gradients without updating parameters.

## Provenance, configuration and licenses

- Official project: [Google DeepMind searchless_chess](https://github.com/google-deepmind/searchless_chess/tree/90ae0e6b121673fc3079aaeffa047580bb600c0a).
- Source revision: `90ae0e6b121673fc3079aaeffa047580bb600c0a`.
- Archive `.cache/research/9M.zip`: **66,375,867 bytes**,
  SHA-256 `e7a62f07c14819ec77433f108d3490599cdf097a49afe64f1be3973d19c34eed`.
- Extracted selected checkpoint:
  `.cache/research/weights/9M/6400000/params`.
  The archive also contains `params_ema`; **that is not selected**.
- Converted checkpoint, saved and read back:
  `.cache/research/deepmind-9m-action-value.pt`, **35,848,237 bytes**.
- [Official README](https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/README.md):
  code **Apache-2.0**, weights **CC-BY-4.0**
  (https://creativecommons.org/licenses/by/4.0/).
  DeepMind copyright and Apache notice are preserved in `action_value.py`;
  independent conversion/tooling modifications are attributed to **Chess Lab
  contributors**, Apache-2.0 (https://www.apache.org/licenses/LICENSE-2.0).
  Converted weights record attribution, license, original archive digest,
  revision, selected step and modifications. No endorsement is implied.

The authoritative [official engine factory](https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/engines/constants.py)
sets the 9M action-value configuration:

```
vocab_size=1968, output_size=128, embedding_dim=256,
num_layers=8, num_heads=8, widening_factor=4,
pos_encodings=LEARNED, max_sequence_length=79,
apply_post_ln=True, apply_qk_layernorm=False, use_causal_mask=False
```

The [transformer source](https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/transformer.py)
right-shifts by BOS zero, multiplies token embeddings by **sqrt(256)=16**, adds
learned positions, and applies sequential pre-LayerNorm residual attention and
SwiGLU blocks plus final normalization. It does not override LayerNorm epsilon:
Haiku's **1e-5** default is used, and is explicit in the PyTorch implementation.
The actual JAX/Haiku reference run tests this, not just a separately assumed
NumPy implementation.

[Official `load_parameters`](https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/training_utils.py)
defaults `use_ema_params=False`; the factory does not override it. Thus selection
of step `6400000/params` exactly follows the factory. The production reader rejects
`params_ema` paths rather than silently changing the model.

[Issue 9](https://github.com/google-deepmind/searchless_chess/issues/9) records the
Flax/Haiku mismatch for the separate state-value release. The author comments
retrieved in this task give the state-value configuration and wrapper suggestion;
they do not supply matching Flax source. **For this action-value import, the
factory, actual checkpoint keys/shapes, and executable reference are the proof.**
No unresolved BC assumptions are inherited.

## Safety and mapping

`extract_official` verifies both archive size and SHA-256 before extraction;
rejects absolute/traversal/backslash paths and symlinks; checks resolved targets;
caps members at 100, total uncompressed bytes at 80,000,000, and any file at
40,000,000. The actual archive has 36 members and 66,446,484 uncompressed bytes.
No pickle, Orbax restore or upstream checkpoint Python code is executed.

TensorStore directly reads OCDBT/Zarr float32 arrays. Required keys, exact
shapes, float32 dtype and finite contents are validated; missing/extra tensors
fail, then PyTorch restoration is strict. Each source array maps once:

- `embed.embeddings [1968,256]`, `embed_1.embeddings [79,256]` → embedding tables.
- `layer_norm{,_1,...,_16}.{scale,offset} [256]` → LayerNorm weight/bias.
- Eight `multi_head_dot_product_attention{,_i}/linear{,_1,_2,_3}.w [256,256]`
  → Q, K, V, output projection, transposed for PyTorch Linear.
- `linear{,_1,...,_23}.w` → eight SwiGLU gate/up/down triplets, transposed.
- `linear_24.w [256,128]` and `.b [128]` → bucket head.

Only the previously reviewed pure token/action contracts and mathematically
matching `Block` implementation are imported from `model.py`; `Block(1e-5)` is
used explicitly. No BC class, candidate semantic defaults or converter is used.
Local checkpoint restoration uses `torch.load(weights_only=True)` with strict
metadata, configuration, key, shape, dtype and finite-value checks. Saving is
restricted to `.cache` paths.

## Parent API

```python
# PYTHONPATH=spikes/deepmind-9m; .cache/learning-venv/bin/python
from action_value import (load_official, load_converted, encode_state_actions,
                          expected_values, rank_legal, save_converted)

model, metadata = load_converted('.cache/research/deepmind-9m-action-value.pt')
tokens = encode_state_actions(fen, moves) # int64 [B,79]: FEN77 + actionID + 0
features = model.forward_features(tokens) # normalized last token [B,256]
logits = model(tokens)                    # raw bucket logits [B,128]
# model.head is nn.Linear(256,128); model(tokens) == model.head(features)
q = expected_values(logits)               # [B], current mover's expected return
ranked = rank_legal(model, board, batch_size=8)
best_uci = ranked[0]['move'] if ranked else None
```

Important contracts:

- Input is **unshifted**. The model shifts internally; changing the final dummy
  bucket does not affect predictions. The candidate action survives the shift.
- Absolute FEN77 and 1,968-action order are the exact official contracts,
  including both colors' promotions. No color canonicalization or clock clipping.
- **Features depend on each state-action pair**, not just the board. The
  noncausal transformer includes the candidate action, so cache one 256-vector
  per candidate action. A single board embedding cannot score all alternatives
  through this head.
- Expected return is `softmax(logits) dot ((arange(128)+0.5)/128)`, matching
  official uniform bucket centers. Values do **not** sum to one across moves.
- All legal actions are evaluated in bounded batches; rank by maximum expected
  return. The official repetition override sets return to 0.5 when pushing a
  move creates fivefold repetition or a claimable threefold repetition. Board
  history is preserved and no move is left pushed. This can be disabled with
  `adjust_repetitions=False` for raw neural values. FEN alone cannot retain
  repetition history. Terminal positions return `[]`.
- Training the output head means **128 return-bucket logits**, not 1,968 move
  logits. No training run was performed here.

## Independent executable reference and results

Before source execution, the complete transformer file was reviewed. Tests bind
it to SHA-256
`7359830c02a3ab92a849dad46b71320d0a6c5b8c4d575640136917b1c3fcc6a2`,
first checked byte-for-byte against the pinned GitHub source. Tests execute the
original mathematical source, removing **only** its heavyweight constants/type
interface import and supplying a type-interface placeholder. No mathematical
operation, parameter name, normalization default or configuration is rewritten.

A separate CPU JAX/Haiku subprocess reads the original arrays independently from
TensorStore into the original Haiku module dictionary, **without calling the
PyTorch converter**. Haiku method interception captures the actual original
final Linear output and final LayerNorm output. The original decoder returns
log-softmax normally. Official reviewed `get_uniform_buckets_edges_values` is
also executed for independent expected-return computation. No network is needed
when rerunning these tests with the reviewed source cached.

The fixture includes six state-action rows over four FENs: starting moves,
black-to-move, en passant, castling, promotion, and multi-digit clocks. Compared
all **6 × 79 × 128 logits and log probabilities**, final `[6,256]` features,
and all-position/last-position bucket expectations. Measured maximum errors:

| Comparison | Maximum absolute difference |
|---|---:|
| Raw logits, all sequence positions | 0.0001163482666015625 |
| Log probabilities, all sequence positions | 0.0001659393310546875 |
| Final normalized last-token features | 0.000003814697265625 |
| Expected return, all sequence positions | 0.000008289832466923386 |
| **Expected return, actual prediction position** | **0.00000008574753018741887** |

The earlier unsupervised positions can produce sharp distributions, so their
float32 expectation tolerance is looser than the actual final prediction token.
These measured cross-framework differences are not bitwise equality; they are
small float32 numerical differences against the actual published forward model.

Executed **4 passing tests**: safe verified extraction/rejection; strict mapping
and real Haiku parity; bucket endpoints/uniform expectation, all-legal batch
invariance, dummy-target exclusion, feature/head identity, gradients without
updates, terminal handling, EMA rejection and safe exact save/restore; CLI
conversion/reload. Missing features were exercised failing before implementation
(TDD). Python syntax compilation also passed.

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  .cache/learning-venv/bin/python spikes/deepmind-9m/tests_action_value.py

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  .cache/learning-venv/bin/python spikes/deepmind-9m/action_value.py \
  --archive .cache/research/9M.zip \
  --save .cache/research/deepmind-9m-action-value.pt --batch-size 8 --top 5

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  .cache/learning-venv/bin/python spikes/deepmind-9m/action_value.py \
  --converted .cache/research/deepmind-9m-action-value.pt --top 5
```

Actual starting-position values: e2e4 **0.5337939262**, d2d4 **0.5300725698**,
g1f3 **0.5247133374**, c2c4 **0.5238766670**, e2e3 **0.5148041844**.
These are smoke inference values, not a playing-strength claim.

## Measured CPU cost for parent scheduling

One PyTorch thread, `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, batch size 8,
model already loaded, one warm-up then three timed repetitions per position.
`rank_legal` timings include tokenization, neural inference and repetition rules.
Machine load varies; these are measurements, not guaranteed throughput.

| Position | Legal actions | Median seconds |
|---|---:|---:|
| Starting position | 20 | 0.8035 |
| Ruy Lopez position after 8...O-O | 27 | 1.0892 |
| King/pawn ending | 9 | 0.3764 |

Cached-feature encoder-only batches (`torch.no_grad`, one warm-up, three runs):

| Candidate actions per batch | Median seconds | Seconds/action |
|---|---:|---:|
| 4 | 0.1597 | 0.03994 |
| 8 | 0.3556 | 0.04445 |
| 16 | 0.6535 | 0.04084 |

Thus top-four candidate feature caching costs about **0.16 seconds per position**
on this loaded host, excluding data I/O and model loading. Full-legal evaluation
costs more because each legal action needs its own encoder pass. A separate CLI
first-position call ranged from 0.65 to 1.07 seconds under changing load.
Measured process peak RSS for the timing run was **321,952 KiB**.
Full raw measurements/FENs:
`.cache/research/deepmind-9m-action-value-timing.json`.

Small CPU-reference dependencies were budget-checked before installation:
compressed jaxlib ~86.8 MB, SciPy ~35.3 MB, JAX ~3.5 MB. Installed without package
cache: `jax==0.12.0.1`, `jaxlib==0.12.0.1`, `dm-haiku==0.0.17` plus dependencies
in the existing learning venv. Runtime PyTorch inference does not require JAX.
Disk remaining after installation, extraction and checkpoint creation was about
702 MB; do not download further large artifacts without rechecking the budget.
