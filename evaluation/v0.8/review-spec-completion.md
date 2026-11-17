# V8 spec completion — PASS

**SPEC-1 operational reproducibility gate CLOSED.** This closes only the qualified post-exposure, fixed-candidate reproducibility condition. The original historical pre-exposure provenance limitation remains unchanged.

## Independently verified

- Receipt/resolved-lineage/pre-run digest graph and **5** receipt-listed artifacts; completion timestamps and final completion flags.
- **13,528 runtime file hashes**, including actual Node-resolved CJS, browser ESM, wrappers, Python/Node executables, package files and Stockfish. Recorded/current package and executable versions agree.
- Approved wrapper/driver source hashes, unchanged original selector/evaluator/scorer, byte-identical executable copies, all **8** candidate artifact hashes, original evidence references and all original/copied input-lineage digests.
- Exact equality for all **8 validation artifact results (95 rows each)**, selected models/metrics, **5 model records / 480 heldout answer records (96 each)**, and **20 complete game records**, including PGNs, moves/decisions, outcomes and summaries. Combined PGN bytes also match.
- Game outcomes, heldout hit/top4 totals and promotion gate decisions independently recounted. All five records have four book-off depth-3 games within the 160-ply cap.
- Updated provenance qualification correctly names the complete replay and preserves the original/failed-attempt limitations.

No heavy inference was run. Parent reports complete-driver EXIT0; independently validated final sidecar/receipt artifacts establish that the reviewed final checks completed. Exact evidence and reviewed-source hashes are in `review-spec-completion.json`.

## Recorded policy decision, not a release approval

- **Atlas:** recorded gate passes, **25 vs 21/96** teacher hits. Both lose all four paired games, with no unresolved caps. Describe only a teacher-agreement improvement with no detected regression in this small match sample—not stronger actual play.
- **Pocket:** retain control despite increased teacher hits; control has three losses/one draw, candidate four losses.
- **DeepMind:** retain control; control won validation.

## Claim boundary

This is reproducibility of already-exposed fixed-candidate results in the recorded later environment. It is **not** a fresh holdout, independent statistical evidence, Elo conclusion, retroactive execution freeze, historical provenance repair, publication-helper approval or deployment certification. Boundary identity checks are not continuous anti-tamper or full OS/shared-library hermeticity proofs.

Manual artifact promotion/export fidelity, final UI/quality review, packaging/build/browser and hosted deployment verification remain separate. No production, candidate, original receipt or earlier review files were changed; only these completion reports were created.
