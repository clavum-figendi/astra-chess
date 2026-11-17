# V8 independent spec review — REQUEST_CHANGES

Scope: UI/worker/CLI integration and selection/evaluation implementation only. **Not release approval.** Exact reviewed-file SHA-256 values and base commit are in `review-spec.json`.

## Blocking finding: SPEC-1 (medium)

**The execution freeze is incomplete.** `tools/v8_select.py:58–61` freezes nine first-party sources. It does not bind `src/chess.mjs` or its resolved `chess.js` implementation/lock, although sparse legal enumeration and encoding depend on that import (`tools/v8-score-sparse.mjs:8,14`). Python chess/torch/numpy package identities are not recorded in the freeze either. `tools/v8_evaluate.py:62,70–71,88` runs Stockfish and records its digest only after a game; it never checks an expected pre-exposure opponent digest. The generator already records an engine digest, but the paired runner does not enforce it.

Thus dependency/opponent replacement can pass all current frozen-source assertions. This is a provenance gap, **not evidence that a replacement occurred or that results are incorrect**. Eight candidate-file hashes and nine listed source hashes do match.

**Action:** Do not alter the active frozen evaluator, selector, or receipts. Recover genuinely pre-exposure immutable dependency/opponent evidence if it exists, or qualify the current run and retain controls pending an authorized fully bound run. A future protocol should freeze/check the transitive chess implementation, dependency lock/resolved bytes and runtime package identities, and opponent executable before exposure and after execution; add negative tamper tests. Newly computed post-exposure hashes must not be represented as pre-exposure proof.

## Passed checks

- Focused Node suite: **10/10**; selection Python: **4/4**; outcome Python: **2/2**. Exact commands and coverage are in JSON.
- All **8 artifacts** verified: DeepMind 2, Pocket 3, Atlas 3.
- Frozen split digests match. Validation **95**, test **96**, unique board-side identities, no overlap with checked V3/V4/V5/V7 data, no cross-split board-side or family overlap, teacher moves within legal masks. Depth 12 is verified in generator/protocol, not a per-row field.
- Default ECO, adjacent offline source selector, safe filenames/hashes, unknown-source errors, seeded per-game PGN provenance, book-off policy path, CLI/UCI/aliases, stale-worker cancellation and checksum-protected compiled cache are present and fixture-tested.
- Build source gate confirms asset/docs copying; **no actual build was run**.
- Selection code retains controls on hit ties and uses CE secondarily. Final gate requires heldout nonregression, complete book-off depth-3 paired games, nondecreased points/no added losses, and no unresolved 160-ply caps. Outcome fixtures do not count caps as draws.
- Archived fitting sources match historical manifest digests. Their two current-source diffs contain guards/imports only, no numeric fitting changes. Historical reports certify the archived fitting code, not newly guarded programs.

## Evidence limits / remaining release gates

Most UI/worker/CLI fixtures fake model inference. The sparse ranking test uses an existing actual binary, not a new browser build. Timed clocks/premoves, real browser inference/offline play, full build and extracted runtime/asset verification remain parent-owned. DeepMind encoder equality is asserted in the reviewed code; this review did not reload heavy models. Running evaluation results were not polled/read; there is no promotion or strength verdict.

The corrected invariant audit passed after an initial read-only command assumed a nonexistent `depth` field. No production files, frozen receipts, candidate files or selection were modified; only these review documents were created.
