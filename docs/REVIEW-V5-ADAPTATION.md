# Independent bounded review: v5 action-value head adaptation

Initial scientific review completed 2026-11-16T16:45:40Z; shutdown-delta review completed 2026-11-16T16:57:24Z (tests subsequently completed in the same review). **The original evaluator/source hashes and partial-run observations below are historical; the separately scoped shutdown addendum at the end supersedes the evaluator binding, not the frozen scientific audit.**

Initial review was against local base commit `c5302175076fba107b9a076253dd5e2274f5a34e`. Most reviewed experiment files are untracked: the hashes below, not the commit alone, define scope.

## Verdict

**PASS for the narrow claim of a genuine, frozen, policy-supervised output-head adaptation with an unchanged published encoder. No blocking defect found in the inspected run. NOT evidence of improved playing strength or a completed tournament.** Validation improvement is only one additional bestmove match, selected using validation. This review does not approve browser packaging, publication, or any further tuning after test exposure.

Only this document was created by the review. No run source, data, caches, checkpoints, selection receipts, or evaluator results were modified. No commits, remote writes, large downloads, JAX reruns, or real-data refitting were performed. The existing evaluator was left running; its mutable results were read as a snapshot, not polled to completion.

## Frozen artifact bindings checked from disk

All following SHA-256 checks passed against the existing receipts:

| Artifact | SHA-256 |
|---|---|
| Base `.cache/research/deepmind-9m-action-value.pt` | `767a03340cf2362019eb724b2aaa4829bc0943b4c65b55bb4aa7f937a802bdf2` |
| Adapted `.cache/deepmind-v5/adapted.pt` | `05a434c6925312fc02323c3015d187d78016cef6ecc6485bbc9da0fcc4d3d264` |
| `evaluation/v0.5/adaptation.json` | `07dde4169ff97d8562c01a02cc16615e9e8506cc7ce0c43cbc688fb7584be39d` |
| `.cache/deepmind-v5/selection.json` | `8e3fe82dfcf2b95a8b2d302a6cb107eae222026d24d12669ae420a75f4b32ba7` |
| Train JSON | `3f342ebc9b33523e41ad0ac84b1e473f61713105d0aa35df9350719114795fcf` |
| Validation JSON | `8f0155f2a431d541b45e1a3384dc25a8bb7efb9f73c5bf39824ed0f432ee88ad` |
| Test JSON | `a8186d4ac2ccd16b6eca1bc3ebd51c123f3fe74801fc5c2e9a735b41ee2a7104` |

Train/validation/test paths are `.cache/deepmind-v5/{split}.json`. Generation protocol digest `ec22f0cda248f026dd575d0367b79a3a74f88fef95949d796c5f65984d435b67` was independently recalculated with Node's original `JSON.stringify` ordering; this is the embedded protocol object's digest, not the entire data receipt's file digest. Generator/teacher/UCI-helper source hashes and openings-file digest also matched the data receipt.

Selection was frozen at **16:41:09Z**, test exposure recorded at **16:41:41Z**, with the exact selection digest above in `test-exposed.json`. Adaptation receipt reports `testRead: false`; static inspection shows the fitting entry point reads only train and validation. This is a source/receipt consistency finding, not an operating-system access audit proving that nobody previously inspected labels.

### Reviewed source SHA-256

| File | SHA-256 |
|---|---|
| `spikes/deepmind-9m/adapt.py` | `ca32f1e7a6afad3cdc71b140f8f55ac7262179de67a85eed9bf6b47d1ed70ff0` |
| `spikes/deepmind-9m/fine_tune_head.py` | `79ceab4a19ded1d9ffa9d7c2e65772c8f2ee3d1ac3adcacfcbba72bfaab11f1a` |
| `spikes/deepmind-9m/action_value.py` | `3f4c1b5242e238cdfa7322512697867eaf8243849ce21c217c228c5fe42b0057` |
| `spikes/deepmind-9m/model.py` | `d560ab216cc0b932f6ed84c22fc0cd1b32b34b467feddc3f1fe5886077534c8e` |
| `spikes/deepmind-9m/evaluate_adaptation.py` | `1a680cb68e2405f29f9c3859a2f8c62bc42be066620cf1246d1400c8e0b69045` |
| `spikes/deepmind-9m/test_fine_tune_head.py` | `93846ad46338514d9640a32840f6fe0cd90f754e07026ab5518f0a80e7ce95b0` |
| `tools/generate-pretrained-data.mjs` | `9bf95cffefa1184ac2e2d2b95cc6a5e3834ad74a56daa6a512f44d92925f8c56` |
| `tools/teacher-policy.mjs` | `a3dd3e84536757d64b5f15b8662bd15ce809ad07f39acf723f5ee54174853b34` |
| `tools/uci-engine.mjs` | `d5cbf4ce8a19771992102b950fc48aafd9147fbfa4a38afdcc7dd47b985c8266` |

The four fitting source hashes matched `adaptation.json`; evaluator source bindings matched its currently running protocol. Evaluation protocol digest was `704d8f0430f6dc4c4f1b22958aa250e0265005c9f5ff0d895e987a2412e23431`. No stable hash is assigned here to the still-changing `final-results.json`.

## Verified model and target contracts

- Loaded both checkpoints with `torch.load(weights_only=True)` and compared all **94 state tensors / 8,954,240 scalar parameters** directly. Only `head.weight` (**32,768** scalars) and `head.bias` (**128**) differ: **32,896 total**. Every other tensor is bitwise equal. This is actual head-only adaptation, not training a replacement policy or assuming encoder immutability from optimizer configuration alone.
- Adapted metadata retains Google DeepMind attribution, **CC-BY-4.0** weight license, source revision/archive provenance, base digest, protocol digest, selected epoch, and modification notice. Conversion/code licensing and the previous actual JAX/Haiku parity execution are documented in `spikes/deepmind-9m/ACTION-VALUE.md`. That existing four-test conversion evidence was reviewed, not rerun concurrently with the evaluator. The unresolved behavioral-cloning checkpoint is not used.
- `action_value.py:75–116` preserves absolute FEN77 + action ID + dummy bucket, internal right shift, and candidate-dependent final features. It predicts **128 return bins**, not 1,968 move logits. `expected_values` uses uniform bin centers `(i+.5)/128`, current mover perspective, maximizing across legal actions. This review relies on the earlier conversion parity evidence for the complete upstream token/transformer equivalence.
- Audited all **642 train/validation feature-cache entries**: exact identity digest, legal-action order, finite `[number_of_legal_moves,256]` tensors. Identity binds base checkpoint, fitting sources, generation protocol and batch size. Independently encoded and forwarded two candidates from one training state: cached features reproduced **exactly, max absolute delta 0.0**, and differed between candidates. This spot-check is not a full encoder recomputation of every cache.
- `adapt.py:39–42` constructs `0.75 * one_hot(best) + 0.25 * softmax(1-rank)` on teacher alternatives, embedded in the full legal-action array. Target mass sums to one; rank 1 receives both its hard and soft mass. This is rank distillation, **not a centipawn softmax or calibrated value regression**. All legal alternatives, including zero-target non-top-four moves, participate in the policy softmax denominator.
- `fine_tune_head.py:33–45` uses CE over expected returns divided by **0.05**, plus **0.05 KL(base bucket distribution || fitted bucket distribution)** averaged over legal actions. Priors are detached; feature inputs are detached; a deep-copied head alone is optimized. Fixed shuffle seed, AdamW with zero decay, batch size 16, gradient clipping 1.0. Independent head-policy/expected-value identity assertion passed. The loss changes bucket distributions without outcome supervision; original value calibration is not established for the adapted head.

## Data separation and selection checks

Read-only audit of every current split passed:

- **435 train / 207 validation / 147 test = 789 unique board+side identities**, with IDs exactly SHA-256 of board placement plus side to move.
- No identity overlaps between splits or with the **1,220 unique old v0.3/v0.4 identities** reconstructed from all six old split files. Prior-data identities are reconstructed, but the generator receipt does not itself bind the old files by digest.
- Opening-family SHA-256 assignment recomputed for every row: **17 train / 5 validation / 4 test families**, with no family crossing splits. Identity intentionally ignores castling rights, en passant and clocks, making exclusion conservative, not allowing those metadata variations to evade overlap checking.
- Every row has a unique, complete python-chess legal-action mask; teacher ranks are exactly `1..min(4,legal_count)`, unique legal moves with matching PV roots, depth 10, and rank-1 bestmove. **3,124 teacher entries** audited. Teacher source also rejects incomplete/bound scores; this review did not regenerate the teacher analyses.
- Fresh trajectories use Stockfish 17.1 depth 10 MultiPV 4 and deterministic rank-2 exploration under the stated rule. Opening-family/trajectory correlation means positions are not independent IID observations.

Validation metrics were independently recomputed from the original and adapted head tensors plus all validation caches, matching the receipt **exactly**:

| Head | Top-1 | Policy cross-entropy |
|---|---:|---:|
| Original | 125/207 = 0.6038647342995169 | 1.871682082541323 |
| Adapted | 126/207 = 0.6086956521739131 | 1.8504750146957987 |

Replayed the recorded selection rule across all 12 history rows: original epoch 0 is eligible, top-1 is primary, CE breaks exact top-1 ties (with a `1e-8` margin). **Epoch 6** is selected; six subsequent non-improving epochs trigger patience. Later epochs lower CE but lose one top-1 hit and are correctly rejected. This is **+0.4830917874 percentage points on validation**, not a statistically demonstrated generalization gain.

Executed the actual fitting-entry guard through `runpy`: it raised **`Run frozen/test exposed; refuse fitting`** before loading the real fitting inputs. No real-data optimization was rerun. The evaluator exclusively creates its test-exposure lock before reading test labels, binds it to selection SHA, verifies both weights, and checks every encoder tensor before sharing encoder modules. No test metric participates in checkpoint selection in the inspected code.

## Evaluator findings and limitations

`evaluate_adaptation.py` was statically reviewed in full. It compares legacy Atlas, original 9M and adapted 9M on the held-out rows and schedules **24 games**: two selected test-opening families × two colors × two opponents × three models. It preserves board history for neural repetition adjustment, uses all legal candidates, disallows illegal moves, disables optional model books, and records opponent settings/depth, executable digest, move decisions, timings, PGN and actual termination. Supplied starting opening sequences remain present even though the policy's runtime book is off. Those sequences are fixed before results, using the first and last test-family entries, not sampled as a representative tournament.

- Stockfish depth 3 and GNU Chess depth 1 are narrow, low-depth baselines. Fixed pairs and a tiny family sample do not establish Elo or general superiority. The 160-ply limit includes the supplied opening; unresolved `*` results are correctly kept separate from draws. `claim_draw=True` uses automatic adjudication of claimable draws, not a simulated player's draw-claim decision.
- Position scoring uses raw head expectations without history-based repetition adjustment; games use the official repetition override. This difference is appropriate for independent FEN labels but must not be represented as identical inference conditions.
- At the recorded review snapshot, legacy had **147** position answers, each neural head **101**, and **zero** games had completed; `finishedAt` was absent. These were partial outputs, not failures. **No final test accuracy, game score, or tournament completion is endorsed here.** Parent must validate completed cardinalities, final protocol/source/weight hashes, legality/results and packaged inference after the running job finishes.
- Exposure/selection files are cooperative local safeguards, not tamper-proof access controls. A user can remove them. Generator refuses changes after exposure but does not separately reject an existing selection before exposure. The observed run has consistent hashes and ordering; broader orchestration should enforce source/data immutability throughout the gap.
- Training caches bind source/protocol and legal order, but not a separate features-content digest or explicit FEN field. Test caches are weaker: they bind only base-checkpoint digest and legal order, not encoder-source digest, feature shape/finiteness or FEN. Current sources match and the review found no observed stale-cache defect. These are **future reuse hardening items**, not grounds to edit frozen code mid-run. Resume results are protocol-bound, but their individual predictions are not independently recomputed/cryptographically authenticated by resume logic.
- Evaluator checks its recorded source hashes and weights at completion, but does not recheck data/openings/legacy-model/engine digests against the initial values at the final boundary. Its protocol does not include every transitively imported JS module or environment/dependency version. Frozen local files are a prerequisite; parent should finish with explicit artifact rechecks rather than claiming adversarial immutability.
- The label-generation protocol is source-bound and split digests match, but the fitting entry point does not independently rehash every generation source or recalculate protocol SHA. This review did both relevant binding checks for this run.

## Focused executed tests

Commands ran locally with one-thread BLAS/OpenMP and no bytecode writes:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 PYTHONDONTWRITEBYTECODE=1 \
  .cache/learning-venv/bin/python spikes/deepmind-9m/test_fine_tune_head.py
node --test tests/teacher-policy.test.mjs
```

Results: **1 Python test passed** (`Ran 1 test in 3.878s; OK`) and **1 Node test passed**, zero failures. The Python synthetic test exercises learning, protected original head and split-overlap rejection; the Node test exercises exact ranked teacher alternatives versus the full legal mask. Additional read-only inline Python/Node assertions verified all artifacts, tensor changes, all split identities/legal masks/teacher ranks, all train/validation cache identities, exact validation metrics, selection replay, fresh two-candidate feature parity, real fit-lock refusal and generation protocol hashing. Final audit printed **`ALL_AUDIT_ASSERTIONS_PASSED`**.

No full tournament, full JAX suite, full cache encoder regeneration, browser build, distribution archive, GitHub deletion or publication verification was within this bounded review.

## Shutdown-delta addendum — separate evaluation scope

**Verdict: PASS for the inspected lifecycle repair and evidence-preserving restart.** The original scientific findings remain applicable: base/adapted weights, fitting source hashes, adaptation receipt, selection digest and all three dataset digests were rehashed and still match their original bindings. No head was refitted by this review. The first evaluation did have a real lifecycle defect not exercised by the initial bounded scientific review: `readline.close()` did not terminate the CLI while the UCI parent's stdin pipe remained open. Accordingly, the earlier no-blocker statement must not be read as successful end-to-end lifecycle/tournament verification of the original evaluator.

### Exact reviewed delta

- `laptop/cli.mjs`: the only tracked source diff is the `quit` branch changing from `input.close()` to `{ input.close(); process.stdin.destroy(); }`. This explicitly releases the still-open stdin stream without force-exiting before stdout drains. Policy/model selection and move handling are unchanged.
- `engine_cleanup.py`: for each non-None engine, calls `quit()`, always attempts `close()` in `finally`, collects ordinary exceptions, continues cleaning remaining engines and then rethrows the first error. A failed legacy quit no longer skips opponent cleanup. Exception propagation remains intentional: the helper does not silently convert infrastructure failures into successful evaluation completion.
- Evaluator diff against the preserved old source contains only the helper import; inclusion of its source hash; explicit `drawConvention: automatic claim_draw=True; caps unresolved`; and replacing the two serial finally-block quits with `close_engines(legacy,opponent)`. Neural inference, test scoring, fitted weights, starting positions, opponent depths, draw adjudication behavior, ply cap and game enumeration are unchanged. The convention is newly recorded, not a change to actual draw behavior.
- Cleanup cannot guarantee recovery from an unbounded/blocking engine `close()` or process termination; it catches ordinary Exceptions, not BaseException. Opponent creation/configuration still precedes the game's try/finally, so a configure-time failure is outside this helper's cleanup coverage. These residual exceptional-path limitations do not invalidate the observed repaired quit path or require edits to the frozen running evaluation.

### Distinct immutable evidence and source bindings

| Scope/artifact | SHA-256 |
|---|---|
| Historical `evaluation/v0.5/partial-before-uci-fix.json` | `4b84d2ca9a3454da7024399188519cebcc027377411a6f068bc522bbbd2abd1f` |
| Historical `evaluation/v0.5/evaluator-before-uci-fix.py` | `1a680cb68e2405f29f9c3859a2f8c62bc42be066620cf1246d1400c8e0b69045` |
| Historical CLI (recoverable as `git show HEAD:laptop/cli.mjs`) | `97112725361aa5d47d7d0d83c2fd72cac4a51806c776b942c7041a9978636e40` |
| Revised `spikes/deepmind-9m/evaluate_adaptation.py` | `5b29af3c30030c1c2216673db0234436b538ebf4808308d646dcea0eebbcac53` |
| Revised `laptop/cli.mjs` | `6362e70da8440f408268447e38ae791d9d96698ec6ddc11140f37a8a3291f222` |
| New `spikes/deepmind-9m/engine_cleanup.py` | `07eb537d593600ce41080ccf81a03c0bf8871fccb2666bd299fdc00abac9d353` |
| New `spikes/deepmind-9m/test_engine_cleanup.py` | `f349252faa92e77754dbafe21e8326f8f100bec35c515c37e4e44a8c3a4fb35d` |
| New `tests/uci-exit.test.mjs` | `4287b27cc2684ff732c24d3bf03f7962c56ffaa6721644d1a139cd1940644f67` |

Old protocol SHA-256: `704d8f0430f6dc4c4f1b22958aa250e0265005c9f5ff0d895e987a2412e23431`.

Restarted protocol SHA-256: `9dd5561e5f5b068f584b2561b1208a6c2722103d59fab88843518f42c8fb98b6`.

Both protocol object digests were independently recalculated; only `sources` and `drawConvention` differ. All revised protocol source hashes matched current files. The preserved evaluator matches the old protocol's evaluator digest; Git HEAD's CLI bytes match the old CLI digest. Both protocols bind the same frozen selection SHA `8e3fe82dfcf2b95a8b2d302a6cb107eae222026d24d12669ae420a75f4b32ba7`.

The preserved receipt contains exactly **147 answers per model** and **one legacy-Atlas White loss, 0-1 by checkmate at ply 70**. It is explicitly partial/historical evidence, not a completed tournament. The restarted receipt's complete position-answer arrays **and position summaries are exactly equal** to the preserved arrays/summaries, consistent with unchanged weights/data and re-execution from the same features. At the single restart snapshot there were **two games**, with no `finishedAt`; no tournament completion is endorsed. Receipt contents alone cannot prove each decision was rerun rather than copied; the revised evaluator source reruns all games when initialized with an empty game list, and the parent reports that initialization. Do not merge old and restarted game lists or discard the preserved loss as if it never occurred.

### Cheap tests actually executed for the delta

```sh
node --test tests/uci-exit.test.mjs tests/book-cli.test.mjs tests/laptop.test.mjs
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 PYTHONDONTWRITEBYTECODE=1 \
  .cache/learning-venv/bin/python spikes/deepmind-9m/test_engine_cleanup.py
```

- **7 Node tests passed**, zero failures: both stdin-EOF and still-open-stdin UCI quit cases, book/CLI behavior, legal move/history handling, repetition and invalid-position state handling.
- **1 Python cleanup test passed**, zero failures: a simulated first-engine quit timeout still produced `legacy quit`, `legacy close`, `opponent quit`, `opponent close` and then raised the timeout. The test is a focused failure-path check, not exhaustive coverage of close errors/multiple failures.
- Independently ran an actual python-chess `SimpleEngine.popen_uci(['node','laptop/cli.mjs','--model','atlas','--no-book'], timeout=5)`, requested a move from the start position, verified legality, then called `quit()` and `close()`. Result: **`ACTUAL_ATLAS_PLAY_QUIT_OK b1c3 seconds 1.689`**. This exercises the real parent-owned open-pipe lifecycle without loading another neural encoder.
- An additional opening-book/exit test invocation passed four tests. The authoritative seven-test command above was then run explicitly; test totals are not conflated into a larger distinct suite count.

No code was edited by this reviewer. Only this review document was updated. Full final-game legality/results/cardinality and final-boundary hash rechecks remain with the parent after tournament completion; no heavy reference execution was launched during the running tournament.
