# v8 bounded contrastive weight repair — handoff

## Ready artifacts; no release selection

All development uses the existing v5 **435 training / 207 validation** positions, depth-10 top-four teacher moves and full legal masks. No `.cache/v8/validation.json`, `.cache/v8/test.json`, new holdout features or final scores were read. Epoch 12 is fixed; no epoch or candidate is selected here. Runtime remains searchless, with no successor heuristic, new layers, topology edits, or parameter-count increase. All public model files and existing source/helpers are untouched.

| Family | Candidate | Validation bestmove correct / 207 | Changed weight scalars |
|---|---|---:|---:|
| DeepMind | current control | 126 | 0 |
| DeepMind | rank1-0.5 | 126 | 32,768 |
| Pocket | exact current control | 56 | 0 |
| Pocket | enemy-protected | 57 | 55,903 |
| Pocket | enemy-relaxed | 63 | 65,303 |
| Atlas | exact current control | 52 | 0 |
| Atlas | enemy-protected | 56 | 806,029 |
| Atlas | enemy-relaxed | 61 | 815,429 |

Sparse scores above were independently reproduced by **the actual `chooseMove` deployed runtime on all 207 development validation positions for every binary**, not just the optimizer feature cache. These are reused development results, not new holdout results or Elo/playing-strength claims.

DeepMind's rank-one repair changes **zero development validation predictions**. Its cross-entropy improves from 1.848589 to 1.846973, but there is no demonstrated bestmove improvement. Retain it only as an auditable candidate/control comparison; no superiority claim. An initially proposed larger rank-one norm cap produced the exact same matrix because neither bound was active; its redundant files were removed and it is not a separate candidate.

### Candidate files

- Current DeepMind control: `.cache/v7/deepmind-selected.pt` (unchanged).
- DeepMind full folded checkpoint: `.cache/v8/weight-deepmind-rank1-0.5.pt`.
- DeepMind standalone **already-folded** head: `.cache/v8/weight-deepmind-rank1-0.5-head.pt` (plain `weight` / `bias` state dict). It starts from the current v7 selected head; do not apply another .95 scale / draw bias.
- Pocket binaries: `.cache/v8/weight-pocket-{control,enemy-protected,enemy-relaxed}.bin`.
- Atlas binaries: `.cache/v8/weight-atlas-{control,enemy-protected,enemy-relaxed}.bin`.

SHA-256 digests, settings, history, changed-group/scalar counts, protected-edge counts and readback evidence are in `weight-*-development.json`, `weight-*-artifacts.json`, and `weight-deepmind-verification.json` in this directory.

## What the wrong-move inspection actually showed

There are **166 wrong DeepMind training predictions**, and **325 each for the two sparse controls** against teacher bestmove. Reports include actual FENs, wrong moves, teacher best moves and numeric gap decompositions—not semantic neuron names.

DeepMind's largest inspected failure is position `5b33c6030017503a99f411e9986be748b31d2bc9d327bb89943bed3f1b62947d`: `f3h2` instead of `b3d5`, expected-return gap 0.239052. Integrated gradients along the best-to-wrong normalized-feature segment assign 0.045809 of the gap to feature coordinate 231; the quadrature completeness residual is 0.000061. This is a descriptive sensitivity along that interpolation, **not evidence that coordinate 231 represents a chess concept**. Exact bucket-contribution differences are also recorded.

A shared sparse failure is `3aa80a1469fe23f299c4eacb850c85128f44b24e67dcfb2eb2339bb7d43de65a`: Pocket chooses `b4e1`, Atlas `b4e4`, teacher `d6d5`. Numeric terminal group gaps include +9.9 (`relu:9.9|lateral`), +5.9 (absence of a -5.9 straight term on the wrong move), -5.5 and -3.2 (the direct enemy-knight material term favouring the teacher move). These actual contributions motivated an opt-in bounded enemy-material ablation; no relu-group chess semantics are claimed. Most learned capture-material multipliers reach the declared 1.5 upper bound, which supports testing the bounded ablation but **does not justify widening bounds or claiming generalisation**.

## Experiment contracts

- Teacher target: 75% bestmove mass plus 25% rank-softmax over **only the provided top-four**. Every unranked legal alternative has exactly zero target mass.
- Objective: full-legal policy cross-entropy plus 0.5 hardest-legal-negative hinge; no raw-centipawn regression. Temperature is fixed during each fit, not the learned intervention.
- DeepMind: fixed normalized centred bucket direction times a learned 256-feature direction, projected to Frobenius delta norm <= .5, then folded into the same 128x256 head matrix. 12 epochs, Adam .002, regularization .01. Actual delta norm 0.217901. Head bias is unchanged. All encoder tensors are bitwise equal to the original verified converted checkpoint, not merely to v7.
- Sparse: terminal affine weights grouped by original numeric source/weight family and coarse move geometry (knight/straight/lateral). No hidden/backbone or bias changes. 12 epochs, Adam .015, regularization .1; free non-material groups constrained to [.8,1.2]. The protected ablation keeps direct enemy-material edges at scale 1; the relaxed ablation allows [.5,1.5] on those 9,400 edges. All abs(weight)>=50 edges stay unchanged, as do all nonterminal weights and topology arrays.
- Float32 optimizer endpoints can slightly exceed decimal bounds; export clamps multipliers to the declared decimal bounds before using the existing checked writer. Serialized legal predictions were checked independently.

## Verification

- Python unit tests: 3 pass (partial-label mass, projected rank-one folding, hard-negative gradient). Missing-function RED failures observed first.
- Node protection test: 1 passes; initial missing-module RED observed first. It checks all eligible direct enemy-material edges and mate-scale terminal protection on the real Pocket model.
- All sparse binaries parse/checksum successfully; every topology array and bias equals the control. Exact binary control SHA matches its public source.
- Sparse roundtrip legal score/prediction checks on five raw FENs per candidate; all 207 development predictions per candidate then re-evaluated independently through `chooseMove`.
- DeepMind save/load all tensors equal; exactly 32,768 head-weight entries changed, zero other entries. Parameter count remains 8,954,240.
- DeepMind recomputed the first train and first development-validation raw FEN, all 36 / 27 legal actions: encoder/cache max error **0.0**, complete ranking equal. This supplements the all-cache identity and dataset SHA checks, not a claim of recomputing all 642 encodings.
- Final public Pocket SHA: `038ed43c7ab65497633289a24a66e9a28de58fe782faa470ef82dbbc448aaf3f`.
- Final public Atlas SHA: `45b639b0d0584b93aa472cef413c104b174d488ebc922d1c1b774c4b23cdcb85`.
- Final v7 DeepMind control SHA: `d4d5b25a4f2a01e22ea8945e42e37559e0ce0525177290d49f002c94bda761ea`.

## Reproduction

Run sequentially, one CPU thread for Torch, without new holdout access:

```sh
node --test tests/v8-weight-sparse.test.mjs
.cache/learning-venv/bin/python tests/test_v8_weight_repair.py
node tools/v8-weights-sparse.mjs cache
.cache/learning-venv/bin/python spikes/weight-repair-v8/run.py
node tools/v8-weights-sparse.mjs export
node tools/v8-weights-verify.mjs
.cache/learning-venv/bin/python spikes/weight-repair-v8/verify.py
```

Fitting all retained candidates took 48.96 seconds after feature extraction. No GPU, cloud, paid API, network or parallel Torch processes were used. Initial harness failures (integer-valued feature lists requiring explicit float32 conversion; float32 boundary overshoot at export) were fixed and all retained artifacts regenerated and verified. No commits/publication. CPU ownership is released for the parent's fresh depth-12 validation, freeze and final evaluation.
