# V8 experiment and delivery gates

## Goal

Add selectable opening-book sources/profiles (retain the existing ECO repertoire; investigate actual Masters and high-rated Lichess statistics). Attempt genuinely different, bounded weight repairs for the three active models without adding game-tree search. Current models remain controls; book-assisted results never substitute for policy-only evidence.

## Book-source constraints

Verify primary sources and rights for each resource independently. The CC0 statement for Lichess database exports does not automatically license the Masters database. Preserve query parameters, retrieval timestamps, raw-response/source hashes and exact coverage. Rate-limit sequential public queries and cap acquisition; do not advertise a small snapshot as the complete explorer. Distinguish empirical game counts from named-line votes and transformed variety weights. Play stays offline where reuse permits packaged snapshots; any live-query alternative needs an explicit, separate disclosure and decision.

## Weight proposals

The new proposal stage may use prior development data, never the new V8 final set. DeepMind: test constrained low-rank/contrastive corrections folded into the existing head, with the encoder unchanged and no new runtime search. Pocket/Atlas: test contrastive full-legal policy targets from depth-10 teacher data (unranked legal alternatives receive zero target mass, not invented ranks). If selectively relaxing material coefficients, document those groups and retain king/mate-scale protection. Diagnose actual failed training positions and contribution terms; do not assign invented semantic meanings to hidden neurons.

Bound candidate counts and training budgets before fresh validation. Preserve all previous files; record changed scalars, source/base/data hashes, parameter constraints and development results. A candidate file or lower fitting loss alone is not an improvement claim.

## Fresh selection/evaluation

`tools/generate-v8-data.mjs` samples 16 supported opening families from a frozen copy of the CC0 repertoire. The eligible-family list comes from the earlier curated repertoire; both sources are hash-bound. Whole families alternate between validation and final test, with a new deterministic sampling salt. Teacher: Stockfish depth 12, top four ranked alternatives plus full legal masks. Trajectories run at most 56 plies beyond the opening, sampling every fourth ply after eight. A near-best rank-two continuation occasionally diversifies trajectories. Exclude every prior v0.3/v0.4/v0.5/v0.7 board-side identity.

For each family, compare proposals with its current control using fresh validation bestmove matches. Retain the control on equal hits; break ties among strictly improved candidates by policy loss where comparable, then smaller modification. Freeze source/artifact hashes before opening the final set. No post-test retuning. Candidate promotion additionally requires non-regressing final bestmove hits and paired actual-engine results. If gains are absent or inconclusive, retain the control and report the attempt. This is a bounded experiment, not a proof of global optimality or Elo.

Re-export any accepted transformer and check FP16/reference fidelity and actual browser execution. Validate book-source switching, seed/provenance in PGN, premove/clock cancellation and packaged CLI equivalents. Independently review and verify hosted files/real play before declaring deployment complete.

Paired-game gate, specified before final exposure: use the first two test-family openings with colors reversed, Stockfish depth 3, one thread, 16 MiB hash, no book and a 160-ply cap. Caps remain unresolved, never scored draws. Promotion requires both control and candidate to finish all paired games without caps, nondecreasing win/draw points and no additional losses. Equal outcomes do not establish stronger play; any promotion under equal outcomes is only a measured teacher-agreement improvement with no detected regression in this small match sample.
