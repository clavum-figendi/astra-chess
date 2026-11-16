# v0.3 independent core review

- **Verdict:** the frozen tuned binaries and saved experimental measurements are internally consistent and reproducible within the scope below. **Conditional acceptance for experimental delivery, not unconditional approval of the reusable experiment pipeline.** Two tooling/reporting issues remain: capped games are included in the generic `draws`/`score` fields, and the primary optimizer does not enforce a permanent final-test lock. Neither finding invalidates the byte identities or the independently recomputed position measurements. Do not present capped games as genuine draws or reuse this opened final test for further selection.
- Reviewed repository: `/home/hermes/projects/astra-chess`; base commit `90a7b851cebc96044f72d9565b0239cafe7133e1`.
- Independent review completed 2026-11-16 UTC. All 35 scoped file hashes remained unchanged at the final review check.
- **Not approved or inspected here:** concurrently changing UI, CLI, package/build/deployment integration, default-selection behavior, or general release documentation. This is not a deployment certificate. No implementation, model binary, dataset, result file, Git index, commit, or external publication was changed by this review. The only repository file created is this report.

## 1. Scientific and specification integrity

### Verified

1. **Real offline teachers/opponents, unchanged searchless runtime.** The UCI bridge spawns actual local executables without a shell. Focused tests executed Stockfish 17.1 and GNU Chess 6.2.9, not simulated strength substitutes. Every model turn in the harness calls `src/engine.mjs::chooseMove`; that module and `src/network.mjs` are unchanged from the base commit. The runtime performs one sparse affine/ReLU forward pass plus legal masking, with no imported engine or tree search. All four original model binaries are unchanged from the base commit.
2. **Splits and provenance.** Reconstructed the exact deterministic sampling from all 32 saved trajectory PGNs and reproduced the saved position lists. Counts are **192 training / 64 validation / 128 final-test**. Assignment is by opening-group index: remainder 0/1 training, 2 validation, 3 test. Both trajectories stay with their group. The first-two-FEN-field board identities are unique within and across all three splits, a stricter board-disjointness condition than merely comparing full FEN strings. Cached label SHA-256 values, base hashes, and group definitions match their sources.
3. **Labels and perspective.** Checked all **13,209 labelled legal roots**, including **197 signed mate roots**, for exact legal-root coverage, depth 4, unambiguous cp versus mate, and the saved conversion. Engine scores remain **side-to-move**, matching the policy's canonicalized own-side inputs and root ranking. No erroneous White-perspective sign conversion was found. Mate values remain separately recorded; their explicit surrogate is not a real centipawn evaluation.
4. **Selection and frozen final test.** Recorded source hashes, protocol hashes, selected vectors, configuration metadata, optimization digest, frozen-selection digest, and selected binary digests all match. Both optimizers recorded four Adam rounds ending in validation plateau followed by two bounded training-regret coordinate passes, with serialized candidates selected by validation regret. Frozen time is `2026-11-16T07:22:12.946Z`, before final evaluation start `2026-11-16T07:23:34.596Z`. The reviewed fitting code reads training/validation, not final-test labels, and the coordinate refinement rejects an already opened final evaluation. There is **no evidence in the inspected code or receipts of final-test-based selection**. This is consistency evidence, not an immutable access log: labels were generated offline before final evaluation, and timestamps/boolean declarations alone cannot prove nobody inspected them. The original optimizer's missing future-run lock is finding S2 below.
5. **Exact binary rewrite, not a runtime overlay.** Rebuilding each tuned binary in memory from its pinned base, bounded scales, and metadata reproduces its complete saved SHA-256. Sparse row pointers, biases, activations, sources, and output topology are unchanged. Every stored weight equals the expected Float32-rounded base-times-scale value; all nonhead and protected-group weights remain unchanged. Pocket Tuned changes **43,111** weights with **71 groups / 64 free**; Atlas Tuned changes **689,106** weights with **89 groups / 82 free**. Complete binary hashes are in the receipt below.
6. **Cached-feature versus deployed inference.** On all 64 validation positions, both tuned models chose exactly the same moves from cached features and actual serialized inference. The maximum discrepancy among the 314 returned top candidates per model was `1.2163047680147088e-7` for Pocket and `3.2529327587127455e-7` for Atlas. Therefore cached arithmetic is not bit-exact score parity after Float32 serialization, but observed move parity holds and actual serialized validation was independently recomputed. Final selection is evaluated on serialized inference, not solely cache predictions.
7. **Saved final position results.** Independently executed all **768** frozen-model predictions (128 positions × six models) and recomputed every saved chosen move, teacher score, regret, mean, within-20 threshold, and 200-threshold indicator. They match.
8. **All 120 saved matches.** Verified the complete expected setting/opening/color/model key set, with no missing or duplicate game. Legally replayed every PGN, checked opening prefixes, recorded decision FENs/moves/plies, result and termination headers, checkmate/repetition semantics, and nonterminal caps at exactly 160 plies. All **4,079** model-decision records match their PGN positions and moves. Re-executed one midpoint policy decision per match (**120** actual inference checks), including the exact saved top candidates. The combined PGN file equals the per-game records. This review did **not** rerun the full tournament or independently search every saved opponent move.

### Independently recomputed final position measurements

These are **clipped teacher-score regret units**, not Elo. Nonmate terms use the engine's cp values; mate terms use the documented surrogate before clipping to 2,000. Threshold names containing `cp` in the JSON do not turn mate surrogates into genuine centipawns. Positions within opening groups are correlated; no statistical significance or population-strength improvement is established.

| Model | Mean clipped regret | Within 20 | Regret ≥200 |
|---|---:|---:|---:|
| Pocket | 167.5625 | 0.28125 | 0.1875 |
| Pocket+ | 177.7734375 | 0.2578125 | 0.1953125 |
| Pocket Tuned | 177.25 | 0.3046875 | 0.1796875 |
| Atlas | 145.3515625 | 0.3203125 | 0.1640625 |
| Atlas+ | 145.3515625 | 0.3203125 | 0.1640625 |
| Atlas Tuned | 144.796875 | 0.296875 | 0.1640625 |

The mean-regret gains versus the respective Plus model are only **0.5234375** and **0.5546875** units on this final test. Pocket Tuned is worse than original Pocket on mean regret; Atlas Tuned's within-20 fraction is worse than Atlas+. This is mixed, tiny evidence, not uniform improvement. Both serialized validation selections match their saved measurements: Pocket+ `243.34375` → Tuned `215.875`; Atlas+ `175.125` → Tuned `165.40625`.

### Actual match outcomes: caps are not terminal draws

| Model | Wins | Genuine terminal draws | Checkmate losses | Nonterminal 160-ply caps |
|---|---:|---:|---:|---:|
| Pocket | 0 | 0 | 19 | 1 |
| Pocket+ | 0 | 0 | 18 | 2 |
| Pocket Tuned | 0 | 1 | 19 | 0 |
| Atlas | 0 | 0 | 19 | 1 |
| Atlas+ | 0 | 0 | 19 | 1 |
| Atlas Tuned | 0 | 0 | 15 | 5 |
| **Total** | **0** | **1** | **109** | **10** |

Each model has 20 games: eight versus Stockfish `go nodes 128`, eight versus GNU depth 1, four versus Stockfish depth 3 stress. The one genuine draw is `gnuchess-d1/15/w/pocket-tuned`, threefold repetition at 40 plies. The ten caps are unfinished outcomes, not demonstrated saves or draws. No equal-node claim is made for GNU, whose adapter's node-limit overshoot was reproduced in the focused tests. These low-budget opponents and the finite tied-head tuning family cannot establish grandmaster strength, global optimality, a fully optimized model, or an Elo rating. Retaining originals as defaults is consistent with the weak evidence, but actual default integration is outside this review.

### Scientific/reporting findings

**S1 — Medium; conditional release gate for consumers: cap-as-draw fields are easy to misreport.**

- `tools/engine-games.mjs:35` deliberately returns `result: '1/2-1/2'` with `termination: 'ply-cap'` for a still-nonterminal board.
- `tools/evaluate-engine-tuned.mjs:55–56` includes those games in generic `draws` and half-point `score`, while also providing `plyCapDraws`. Consequently the saved summaries contain 11 `draws`, but only one is a genuine rules-terminal draw. All saved arithmetic is internally correct under that explicit scoring convention; the convention is not a statement of chess result.
- **Required for delivery:** report terminal draws and caps separately and never present generic `draws` or `score` as uncensored strength evidence. An unresolved/`*` cap result or explicit `terminalDraws`, `cappedGames`, and convention-labelled score would make future tooling safer. This report does not mutate frozen results. If integration consumes the generic fields as actual draws without subtracting caps, that is a release blocker outside this scoped approval.

**S2 — Medium; changes requested before a new experiment: primary optimizer can overwrite a frozen run after final-test exposure.**

- `tools/optimize-engine-weights.mjs:8–16,39–44` has no counterpart to the final-test-exposure guard in `tools/refine-engine-weights.mjs:8`; running it again can replace optimization/selection receipts after results or test features already exist.
- `tools/cache-engine-features.mjs:7` gates test-feature access only on existence of a frozen-selection file, not its digest or a permanently consumed run identity.
- Existing evaluator digest checks detect incompatible resumed artifacts, and this review verifies the current frozen chain; **no contamination was observed**. Nevertheless future reproducibility relies on operator discipline. Use an immutable run directory/final-test access marker and refuse all fitting entry points after exposure. A new tuning decision requires a fresh untouched test set, not reclassification of the current final test.

**S3 — Limitation; reproducibility from a clean distributable is not certified.**

The training labels/features and frozen private selection live in `.cache/`; the public receipts contain their digests but are not themselves the full labels. This review had the local cache and verified it. Public `tuned-config.json` plus the pinned base models is sufficient for exact tuned-binary rebuild; rerunning the scientific fit from a clean source package also requires regenerating or supplying the labelled dataset and engine assets. No clean extracted-archive training reproduction was attempted. The saved experiment has very few independent opening groups and uses shallow MultiPV teacher scores, with no independent long-search teacher audit, confidence interval, or strength inference.

## 2. Code quality and focused execution

- **24 focused tests passed, zero failures, zero skips**, including actual Stockfish/GNU executions. Command from this repository:

  ```sh
  node --test tests/engine-labels.test.mjs tests/head-coordinate.test.mjs \
    tests/head-optimizer.test.mjs tests/rebuild-tuned.test.mjs \
    tests/uci-engine.test.mjs tests/weight-tuning.test.mjs
  ```

- UCI tests cover incomplete/mixed-depth/bound MultiPV handling, absent scores, timeouts, poisoned sessions, exits, illegal/null moves, concurrency rejection, history/FEN/limit validation, stale output, and real legal games. Real GNU `nodes:300` returned the explicitly marked cooperative-stop mode with 10,000 observed nodes, not a fabricated exact budget. No engine test was silently replaced by a fixture.
- Reviewed new tool code and relevant source boundaries: no hardcoded credentials, shell-string execution, eval, network exfiltration, or runtime-engine import was found. Executable paths are local configuration and UCI newline/NUL inputs are rejected. This is a scoped manual review, not a dependency or host-security audit.
- Rebuild validates identity, pinned bases, scales, and complete output digests before publishing its staged binary list. Tests use temporary fixture trees; the reviewer rebuilt real bytes **in memory**, without invoking the repository-writing rebuild CLI.
- **Nonblocking hardening:** `head-coordinate.mjs:4` does not require integer passes or validate finite/bounded initial scales; unlike `head-optimizer.mjs::pack`, it lacks full feature-row validation. `refine-engine-weights.mjs:17–20` does not recheck feature base/group/label digests, whereas the primary optimizer checks base/group identity. The local caches were verified valid here, so these are future fail-closed improvements, not a demonstrated defect in the saved fit. Add regression tests for fractional budgets, malformed feature matrices, and changed caches.
- **Test coverage caveat:** feature parity tests themselves cover Pocket on two opening positions; this review expanded serialized move parity to both models on all validation positions. The initial all-candidate reviewer sweep completed Pocket's seven candidates, then was interrupted during Atlas. A subsequent bounded audit rechecked both selected models, both baselines, selection ordering from the seven recorded candidates per model, and all final predictions. It did **not** complete an independent re-evaluation of every unselected Atlas candidate or rerun Adam/coordinate optimization from scratch.
- Full repository tests, changing UI/CLI/build files, browser execution, default selection, and deployment are owned by the parent integration task and are explicitly **not** asserted by this report.

### Review probe receipts

Temporary reviewer-only probe script: `/home/hermes/.hermes/cache/scratch/astra-v3-review-audit.mjs`. The completed bounded invocations were:

```sh
REVIEW_PHASE=models REVIEW_MODEL=atlas-tuned REVIEW_SKIP_CANDIDATES=1 node /home/hermes/.hermes/cache/scratch/astra-v3-review-audit.mjs
REVIEW_PHASE=models REVIEW_MODEL=pocket-tuned REVIEW_SKIP_CANDIDATES=1 node /home/hermes/.hermes/cache/scratch/astra-v3-review-audit.mjs
REVIEW_PHASE=positions node /home/hermes/.hermes/cache/scratch/astra-v3-review-audit.mjs
REVIEW_PHASE=games REVIEW_SAMPLE_DECISIONS=1 node /home/hermes/.hermes/cache/scratch/astra-v3-review-audit.mjs
```

Each completed with exit code 0. JSON receipts in that scratch directory are `astra-v3-review-models-atlas-tuned-0.json`, `astra-v3-review-models-pocket-tuned-0.json`, `astra-v3-review-positions-all-0.json`, and `astra-v3-review-games-all-0.json`. These are local review aids, not required shipped inputs. The initial monolithic probe was interrupted before completion and is not represented as a full passing audit.

## 3. Scope-bound SHA-256 receipt

The following digests bind this review to exact core code, focused tests/fixture, runtime, frozen model configuration/binaries, and saved evidence. Re-review a changed executable/test/data/binary delta rather than carrying this verdict forward automatically. Manifest/UI/CLI/build/deployment files are deliberately excluded because they were changing concurrently.

| Scoped file | SHA-256 |
|---|---|
| `tools/weight-tuning.mjs` | `cd29b6a81235e619b8ddb2b3e42f189a9047e5f8b6720d324d243e7beb11b3a4` |
| `tools/head-optimizer.mjs` | `dcbf9162684f654fa4e7903f26603a97ce34207f4403622cd508b465234e33e4` |
| `tools/head-coordinate.mjs` | `43fdfbcbe9552a201191c2a6a7e83b59d5fd9c620615fb09b921c516740521d5` |
| `tools/engine-labels.mjs` | `edb91e9611b2210b538e181e0e291b57f06db9852a2d06970605f5fa929c9ad0` |
| `tools/generate-engine-data.mjs` | `f92d158167bf8bf99ba612b7bfffb9b827fa50ef9b280af666756d32b5182cf0` |
| `tools/cache-engine-features.mjs` | `0d0025de742622406b721b7e4a77034d7884e7cf71142ac7d59582eec4dafe0a` |
| `tools/optimize-engine-weights.mjs` | `b23fca3b8b69ea3363bf3f23b58a83917ae97991a4641d5eedecefdadd49ae07` |
| `tools/refine-engine-weights.mjs` | `2a520604fb347e311cecb0121349757703577f34b2cecd8c0ad12642553c577f` |
| `tools/evaluate-engine-tuned.mjs` | `078f0c1b02636971e8435ce6062eef3013df2eb5187fd82276593c1d95a76eee` |
| `tools/rebuild-engine-tuned.mjs` | `21088de5d1e07778a973839d2cee6ae1110a56b1f8588c98da2deffd5dfb58ea` |
| `tools/uci-engine.mjs` | `d5cbf4ce8a19771992102b950fc48aafd9147fbfa4a38afdcc7dd47b985c8266` |
| `tools/engine-games.mjs` | `5f9d100146fc516f39669b6c76ae3d6bc96fa0ca02fb6b859bb5334c3b801069` |
| `tests/engine-labels.test.mjs` | `a553ca796e33512894692e0472a3ce3215918590c1e36d0ff3530220f32a4635` |
| `tests/head-coordinate.test.mjs` | `e6c24e22ba7ab7ae8ffdbb017b4a8eb441c6da371d6909e5a7f03eafce5bd291` |
| `tests/head-optimizer.test.mjs` | `73184c104f655b0e85e09558714d09317387c344b3b59f8d08b2cf859b82a862` |
| `tests/rebuild-tuned.test.mjs` | `e078465fe3933776556e826eb60d0b33f6c37d6c4d2fd3bb55586e08e67b23b0` |
| `tests/uci-engine.test.mjs` | `4b265803b1df7f3346824c8b5152a8593a9ddcdc9db9448193b32d82ed79025a` |
| `tests/weight-tuning.test.mjs` | `ed161124195db6092deac5b1adab87d845c859f3cf7c6e65619675e464736eff` |
| `tests/fixtures/uci-peer.mjs` | `7cc7ed929c3414d4531cfdaedfe30b276047744d79602d3cd066b12766e35902` |
| `src/network.mjs` | `f46d3a8fe19809c8780d69bc323707f3287de90582b66eba0ece30c4cbc5fd28` |
| `src/engine.mjs` | `5a381f2ca3b0c4a0d99115b6fef616ae8a6239cc3e802d27e7f26d0edbfe57b7` |
| `src/chess.mjs` | `50e77eeb7df13b537f4d0e681852369c7ebb85e63915373fa5ef2d6359611859` |
| `public/models/tuned-config.json` | `f2f95a2672949cf36bd87877375511cbb45f5efb1c264727cab5989e0d69c9fb` |
| `public/models/pocket.bin` | `77365eb86c5176255e06784592f9022a36ca6730c0dd3e4ce552cbf480762737` |
| `public/models/pocket-plus.bin` | `038ed43c7ab65497633289a24a66e9a28de58fe782faa470ef82dbbc448aaf3f` |
| `public/models/pocket-tuned.bin` | `6fc188f3dd52fab34cfe454e25be761bf61125faf852c8bcf17dc285c83c0e3d` |
| `public/models/atlas.bin` | `45b639b0d0584b93aa472cef413c104b174d488ebc922d1c1b774c4b23cdcb85` |
| `public/models/atlas-plus.bin` | `30313d65ec8b74007a546576b5234aa00a521b63ade9159f1b2ec7f30b05c4a6` |
| `public/models/atlas-tuned.bin` | `ca09975465cd379b96203a52d80db817cc898bc60ae6743f0e778c6efa50de12` |
| `evaluation/v0.3/optimization.json` | `067ea604cab21e1c23b06c1fadd6bf0184a3b5c73bfce794fee7ca23fa95ad94` |
| `evaluation/v0.3/optimization-adam.json` | `eb53173e2d6b5f4095b49784a5cc04ca717c8f2c4dbf0b9e6cdc35573894f0f2` |
| `evaluation/v0.3/data-protocol.json` | `c10007696a64b3ba5718898f237878cc5ec16b01fafbc7c7fb89eecfd01a5337` |
| `evaluation/v0.3/data-games.pgn` | `09689551d98e0a4c22222e5d06aed5001e7fe63c926f370ddea23ee136fb2d05` |
| `evaluation/v0.3/engine-results.json` | `071f9214c8812efaab838393f14dd80c3d40da645a7cc270641fd463e69041e5` |
| `evaluation/v0.3/engine-matches.pgn` | `2130fbb9eafa618b75d8c2aa2d2cd178e1f29e61149ddbe8d646237df200257d` |

Actual opponent executable identities were checked against the files recorded in every saved game:

| Engine | SHA-256 |
|---|---|
| Stockfish 17.1 | `0fd9f5995bceb762f4c87bb577b99de28f0782456b609cb09a47852bba1a4af8` |
| GNU Chess 6.2.9 | `c20685cb4d8176182b58db1d6ad8bf6b90e0d269bfa4d29d053918a80799fe8f` |

**Disposition:** keep tuned variants explicitly experimental; retain the frozen receipts; disclose the mixed/tiny result and all ten caps; do not claim full optimization or elevated playing strength. No core changes are authorized or performed by this review.
