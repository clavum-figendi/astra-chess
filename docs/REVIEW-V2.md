# Independent v0.2 expansion review

Baseline: `6ab9e3d929951d55927e5fc3074d0d59b5e7e8c7` (v0.1 main). Scope: working-tree v0.2 expansion, including new untracked source/tests/models, not merely `git diff`. Reviewed without modifying implementation, model weights, index or Git history.

## Verdict 1 — specification compliance: PASS (reviewed candidate)

The implementation satisfies the expansion contract in `PLAN-V2.md`: preserves both classics, adds two genuinely larger playable models, retains generic one-pass inference, exposes four models on browser and laptop, separates future size proposals, and reports targeted gains alongside negative/unchanged broader results. This is **not** approval of a general strength-upgrade claim or certification of an already published release.

- Byte comparison against `git show 6ab9e3d:public/models/{pocket,atlas}.bin` passed for both originals. `git diff 6ab9e3d -- src` is empty.
- The four binaries parse with only affine/ReLU activation kinds. Independently recomputed parameter counts and output-ancestor reachability agree with the manifest; every stored node is reachable from an output. Plus reconstruction tests also reproduce the shipped bytes exactly. Source inspection shows new connected reasoning terms rather than padding/copies; reachability alone would not establish usefulness.
- Browser options list `pocket`, `pocket-plus`, `atlas`, `atlas-plus`; the existing manifest-driven worker supports those IDs without new scoring logic. CLI allowlist and catalogue expose all four, and the build copies the complete models directory into the laptop bundle. Pocket remains the browser default and Atlas the CLI default.
- Public results correctly report complete puzzle matches 27/36/70/70 of 256, first-move matches 51/63/105/105, and Plus-vs-classic results 2–3–3 and 2–4–2 (wins–draws–losses). Pocket+ also regresses against the weak baselines; this is disclosed. No Elo or general-improvement claim is justified or made.
- Programmatic checking found the same 256 unique IDs in every v0.2 model row set, zero overlap with v0.1, matching cached sample digest, and aggregate counts consistent with stored rows. All six benchmark source hashes and all model hashes match the reviewed files. The deterministic sample-preparation code selects sorted positions 257–512 and pins the upstream digest.
- The post-freeze diagnostic is explicitly separate and targeted: mate selections 0/32, 32/32, 8/32, 32/32; stalemate avoidance 28/32, 32/32, 30/32, 32/32. These are recorded observations, not a theorem about all endings. No coefficients were changed in this review. Hash consistency supports reproducibility; it does not independently prove historical freeze chronology or absence of pretraining exposure.
- Browser Max 64–96 MB, Laptop Pro 128–256 MB and optional Lab 256–512 MB are visibly **proposed, not built**, not selectable weights. All memory ranges exactly match the stated `3 × file MB + 128 MB` planning formula. Documentation labels them unmeasured, mentions parser/compiler/hosting constraints, and requires fresh strength and device measurements before promotion.

## Verdict 2 — code quality and circuit correctness: PASS (bounded domain)

No blocking source or circuit defect found. No stylistic changes requested.

### Why this is genuinely weight-encoded geometry

`tools/endgame-circuits.mjs:16–81` constructs nodes through `Graph`; it does not import chess rules, run a successor board, query a tablebase or call an engine. `compile-models.mjs:287–349` adds these terms only to Plus graphs, compacts output ancestors, and serializes ordinary biases, source indices, edge weights and activation bits. `src/network.mjs:64–77` remains a generic topological affine/ReLU pass. `src/engine.mjs:6–23` performs one forward pass over the raw 768-plane encoding and ranks only legal moves. chess.js make/unmake work in legality generation is not policy search.

The specialist's exactness is conditional on a valid chess position and legal candidate masking:

- `endgame-circuits.mjs:18–27` gates out enemy non-kings, own pawns/minors, and any major count other than one. The valid-board contract supplies one king per side; this is not a validator for arbitrary malformed input vectors.
- `:28–35, :52–67` encode current and candidate-conditioned attacks. Major movement uses the candidate destination and own-king line blockers. King movement uses its new location and fixed major rays blocked by that location. Vacated squares are not retained as blockers. Enemy-king neighboring squares are tested after its departure; the unprotected major square remains capturable because a major does not attack its own origin.
- `:37–48` combines covered neighboring squares with check coverage of the current enemy-king square to distinguish mate from stalemate. Binary coverage and a ring of at most eight squares justify the selector gates. `:69–79` gates ±100 terminal terms and the 0.12 covered-ring change by actual mover/material scope. Castling's two-square king move is explicitly excluded.
- `compile-models.mjs:118–228, :292` reuses Atlas's existing tactical builder with pawn/knight selection for Pocket+; it does not silently substitute Atlas. Other approximation limits remain unchanged.

This proves neither general stalemate avoidance nor long-range conversion. Extra pieces, promotion/capture transitions into the material class, repetition and forced multi-move plans are outside the specialist. The public boundaries accurately say so. Development oracle tests compare successor outcomes; the deployed scorer never imports that oracle code.

### Independently executed checks

On Node `v26.8.2`:

```
node --test --test-concurrency=1 tests/engine-endgames.test.mjs tests/engine-plus.test.mjs tests/laptop-catalog.test.mjs
```

Result: **5 tests passed, 0 failed, 0 skipped**, duration 49,036 ms. This executed the seeded 128-position legal-move terminal comparison, queen/rook fixtures, outside-material inactivity, deterministic Plus rebuild equality, full-graph reachability, white/black mating choices, a knight-fork fixture, four-model CLI catalogue and legal start-position moves for every model.

Additional executed Python/Node assertions verified baseline binary equality, unchanged runtime, six benchmark source digests, four binary/manifest/result digest-and-size matches, puzzle aggregate counts and disjointness, head-to-head record counts/results, sample digest, proposal arithmetic, parser dimensions, exact parameter counts and every node's output reachability. A tracked-added-line scan found zero hardcoded-secret, unsafe-shell, eval/exec or pickle matches; manual inspection of the new circuit and benchmark files found no external service or hidden runtime hook. This is a targeted review, not a comprehensive security audit.

| Model | Bytes | Numerical parameters | Nodes / reachable nodes | Edges |
|---|---:|---:|---:|---:|
| Pocket | 4,423,376 | 514,709 | 55,865 / 55,865 | 458,844 |
| Pocket+ | 8,465,724 | 980,468 | 134,931 / 134,931 | 845,537 |
| Atlas | 38,397,700 | 4,375,054 | 828,757 / 828,757 | 3,546,297 |
| Atlas+ | 41,074,220 | 4,685,447 | 877,098 / 877,098 | 3,808,349 |

### Release boundaries / remaining verification

No source-review blocker. I did **not** independently rerun the full 39-test clean-restore suite, extracted UCI checks, actual four-model browser E2E, public deployment or device memory measurements. Earlier receipts are implementation-side evidence, not my execution. Final browser/extracted-delivery and hosted-byte checks remain the release owner's responsibility. Bind delivery to these hashes, and re-review any executable/model change; documentation-only repacks do not alter this source verdict. A future circuit revision needs a new holdout rather than tuning to the now-evaluated sample.

## Reviewed hashes (SHA-256)

### Model binaries

```
77365eb86c5176255e06784592f9022a36ca6730c0dd3e4ce552cbf480762737  public/models/pocket.bin
038ed43c7ab65497633289a24a66e9a28de58fe782faa470ef82dbbc448aaf3f  public/models/pocket-plus.bin
45b639b0d0584b93aa472cef413c104b174d488ebc922d1c1b774c4b23cdcb85  public/models/atlas.bin
30313d65ec8b74007a546576b5234aa00a521b63ade9159f1b2ec7f30b05c4a6  public/models/atlas-plus.bin
```

### Source, interfaces, tests and evidence

```
f46d3a8fe19809c8780d69bc323707f3287de90582b66eba0ece30c4cbc5fd28  src/network.mjs
5a381f2ca3b0c4a0d99115b6fef616ae8a6239cc3e802d27e7f26d0edbfe57b7  src/engine.mjs
db54ba2fc6d2b9cc9a5ccfef6d06c902d80c5d2dffadf533e095491afafd1ef6  tools/compile-models.mjs
9f75b8ce150d4fcfaadd91bb1a3d4f76af62f1876c866250efe33e5ee9e3e686  tools/endgame-circuits.mjs
aa10498593b702d5901283bbaa4e186ff74cedfa5edf1629933176dca933fb16  tools/benchmark-v2.mjs
b239fd4f345b3202bf47dc6b42978105dfdd1ed7d9e78ac0c58338d356c7c6b1  tools/benchmark-lib.mjs
ec8cb102148c6c5de762d7f95d72b4e34aca3e4d19416835a091c11177147ecc  laptop/cli.mjs
c98ba4ad9181fb51f70c6092ed36cb73ace692fded1d28120fb71c0b3d580b75  tools/build.mjs
1e4780033139b8276a6bd0d30bdb799f0b6d5c1df298544be3e611bceb5430f4  public/index.html
192f94c97e467b1f19ff16af1938ac79eab96006f34cc31df8b2a1a98bf2b4af  public/app.mjs
3d25905ad766295c42370f5ebc90ad2b7c754d6119216ee393bebab12649bcec  public/worker.mjs
8e2869a30d8684f580440a4bc391cf2f320f700472fc50d8d27d4346e61174ae  public/models/manifest.json
1a8499142fec95761e6bb4636082f431d1203f16ffdc8a66f6c56b2bfeb8e975  public/models/sizing-proposals.json
f4f369f8aa67aeb4638a6ecbb0e0172de62e4de9dce69526db78992a446ae01d  tests/engine-endgames.test.mjs
551f5ac69d8c74d97a1920e7e2c6b18eff847d3f2fd46cbdae445187bb2131df  tests/engine-plus.test.mjs
ff9a61af965fc182733e99f68acfcc2b71a80aeb5018aef420ebf5cfe13fbba2  tests/laptop-catalog.test.mjs
8beda5ca85b755a9cba86d772bcfa012b79deddd006b29a23c19695fb52ede76  tools/benchmark-endgames.mjs
4737d9509e37aa12f149031ad010451e2c958a7d138ba677cf9e7e7cd90f8d6e  tools/prepare-benchmark-v2.py
679dd6c903135d650c225f8cfcef30aac0a32b34c4b27e530050f62b86251a65  docs/PLAN-V2.md
996a48139e0c06679b2ec19d41249d1c0e39599231e0b023b4db55ed4de53e23  docs/EXPANSION-V2.md
2b9a40ff867a01845ddc75a23a8085fb933bbddbaeb2bed31dbb5de8af8e1f9c  evaluation/v0.2/results.json
56be3bead4e790c415f6e1ceaceb098baca7d2da22c43f6933ac77d391f7fb36  evaluation/v0.2/endgames.json
```
