# v0.3 — offline weight fitting against real engines

## Outcome

**An optimization experiment, not fully optimized chess.** Two new frozen binaries are available in both the browser and laptop player. Validation improved, but final-test gains over their Plus parents were tiny, engine losses were overwhelming, and no general playing-strength improvement is established. Pocket/Atlas remain the defaults. Grandmaster strength and Elo are not established.

| Model | Full binary bytes | Changed scalar weights vs parent | Tied groups / free groups |
|---|---:|---:|---:|
| Pocket Tuned | 8,466,268 | 43,111 | 71 / 64 |
| Atlas Tuned | 41,074,764 | 689,106 | 89 / 82 |

These are actual rewritten float32 weights, not renamed parent files. Complete saved topology, hidden coefficients, biases and output indexing are unchanged. Metadata/header size increases slightly. The four previously published control binaries are byte-identical. Sizes include sparse topology, not only parameters; larger unbuilt size proposals remain separate.

## Method and provenance

The inherited base is Astra-directed, Sol-assisted. Astra authored the Plus endgame expansion and this numerical tuning experiment; a Sol worker implemented the development UCI bridge/game runner. **Tuned derivatives are automatically fitted/trained, not purely hand-written or training-free.** No pretrained chess-policy tensors are imported. Stockfish is an offline teacher, so these models do use knowledge derived from an existing engine; this is not an independent rediscovery of chess from rules alone.

Inference remains the unchanged generic sparse affine/ReLU forward pass on 768 raw board one-hots, followed by legal masking. No teacher engine, game tree, opening book, tablebase, dataset lookup, or successor-board scoring is present in deployed move ranking. Clock time does not increase strength. Rules enforcement is provided separately by chess.js.

Only terminal affine output edges not consumed by other neurons are eligible for fitting. Original enemy capture-input groups and large terminal-specialist coefficients are protected. Eligible nonnegative tied multipliers are bounded to [0.05, 4]. Grouping distinguishes large promotion-related pawn terms from small placement terms. This is a restricted tied-output family, not all network weights or possible topologies. It cannot manufacture tactical features absent from the backbone.

First strategy: projected regularized Adam on teacher soft targets. Scores relative to the best move are clipped below at -2,000 and divided by temperature 150 before softmax. Four rounds stopped after three successive rounds without the required validation improvement. Second strategy, before opening the final test: two coordinate passes minimizing clipped training regret with a small prior penalty. This consumes the six-round budget per model. Each pass is checked using actual parsed rewritten binaries; final selection is by validation mean regret, with fewer changed coefficients as tie-break. Pocket selected coordinate round 6; Atlas selected round 5. No further adjustments were made from final-test results.

The finite local-compute budget was used instead of an impossible guarantee of global optimality. Adam plateau and the alternative two-pass cap are stopping rules, not a proof that all useful strategies have been exhausted.

## Data separation

Generated trajectories use the actual Stockfish 17.1 and GNU Chess 6.2.9 executables plus frozen original policies. Sixteen predefined legal four-ply openings are split by opening group modulo four: groups 0/1 train, 2 validation, 3 final test. Paired trajectories stay together; board identities (piece placement plus side to move) are deduplicated across splits. Neighbouring positions are not randomly scattered among splits.

- Training: 192 positions.
- Validation: 64 positions.
- Final test: 128 positions, inspected only after coefficient selection was frozen.
- Teacher: Stockfish depth 4 with MultiPV covering every legal root. Incomplete, bounded, duplicate, ambiguous or wrong-depth labels are rejected.
- Evaluation scores are side-to-move. Mate scores remain separately recorded; optimization uses the explicit surrogate `sign(mate) * (10000 - min(999, abs(mate))*10)`. A mate is not asserted to be a centipawn score.
- Reported regret is `min(2000, best_teacher_score - chosen_teacher_score)`.
- A fresh engine process resets hash/history for each game and teacher position.

Public exact labels are in `evaluation/v0.3/data/{train,validation,test}.json`; their hashes match `data-protocol.json`. The multiplier vectors and expected artifact hashes are in `public/models/tuned-config.json`. Optimization histories are in `optimization-adam.json` and `optimization.json`. The saved source and file hashes bind the original experiment; later release documents do not rewrite those historical bindings.

## Held-out results

Mean regret is a shallow-teacher agreement metric, **not Elo**. Lower is better. Within-20 and 200+ regret rates provide additional context; the latter threshold is not a universally calibrated blunder definition, especially for mate surrogates.

| Model | Mean clipped regret | Within 20 | Regret ≥200 |
|---|---:|---:|---:|
| Pocket | 167.56 | 28.12% | 18.75% |
| Pocket+ | 177.77 | 25.78% | 19.53% |
| Pocket Tuned | 177.25 | 30.47% | 17.97% |
| Atlas | 145.35 | 32.03% | 16.41% |
| Atlas+ | 145.35 | 32.03% | 16.41% |
| Atlas Tuned | 144.80 | 29.69% | 16.41% |

Validation regret improved from 243.34 to 215.88 for Pocket+ → Pocket Tuned, and 175.12 to 165.41 for Atlas+ → Atlas Tuned. The much smaller final-test gains caution against extrapolation. Pocket Tuned is worse than original Pocket on mean final-test regret. Atlas Tuned's within-20 rate regresses despite its slightly lower mean regret. There is no statistical-significance claim.

## Actual-engine matches

All six policies played the same paired-colour starts from final-test opening groups: eight games against Stockfish at 128 nodes, eight against GNU Chess at depth 1, plus four stress games against Stockfish depth 3. Total **120 games**, 20 per policy. Full history is sent to UCI. Every move is legally replayed. Engine faults fail the run rather than becoming synthetic draws. These limited engine budgets are not full strength, equal compute, or tournament clock settings. GNU Chess ignores native node budgets; depth was used instead, not a false equal-node comparison.

| Model | Wins | Losses | Actual rule draws | Unfinished at 160-ply cap |
|---|---:|---:|---:|---:|
| Pocket | 0 | 19 | 0 | 1 |
| Pocket+ | 0 | 18 | 0 | 2 |
| Pocket Tuned | 0 | 19 | 1 | 0 |
| Atlas | 0 | 19 | 0 | 1 |
| Atlas+ | 0 | 19 | 0 | 1 |
| Atlas Tuned | 0 | 15 | 0 | 5 |
| **Total** | **0** | **109** | **1** | **10** |

All losses are checkmates; the one actual draw is Pocket Tuned versus GNU Chess by repetition. Atlas Tuned had three cutoff games versus Stockfish-128 and two versus Stockfish-depth3; this does **not** prove those positions were drawable. The runner's raw result field encodes capped games as `1/2-1/2`, always with `termination: "ply-cap"`. The table deliberately separates them; do not sum them into actual rule draws or use the raw score to infer Elo. Small shared-opening samples and decisive-score saturation do not support promotion of a default model.

Raw per-move decisions, engine identities/options/hashes, model and source hashes, settings, timings and results: `evaluation/v0.3/engine-results.json`. All PGNs: `engine-matches.pgn`. Derived totals: `summary.json`. Engine acquisition/protocol limitations: `docs/ENGINE-PROTOCOL.md`. No engine binaries are redistributed in the player.

## Reproduce

Artifact reconstruction (no teacher engines needed):

```
npm ci --ignore-scripts
npm run weights
npm test
npm run build
```

The compiler reconstructs four authored controls, then `tools/rebuild-engine-tuned.mjs` checks the pinned parent hashes, applies the saved multipliers and requires the exact published tuned SHA-256. Browser and laptop both use these same binaries. The optional fitted policies are `pocket-tuned` and `atlas-tuned` in the CLI.

To repeat the original fitting experiment in a separate fresh checkout/cache, obtain engines following ENGINE-PROTOCOL.md, then run `tools/generate-engine-data.mjs`, `tools/cache-engine-features.mjs`, `tools/optimize-engine-weights.mjs`, `tools/refine-engine-weights.mjs`, and finally `tools/evaluate-engine-tuned.mjs` with Node. Scripts run from the project root. Check generated dataset and source hashes against the archived protocol; engine/CPU/compiler differences can change trajectories. Coordinate refinement refuses an already opened final evaluation, but the primary optimizer lacks a permanent exposure lock. Do not rerun fitting on this opened holdout or overwrite its frozen receipts. A new study requires a new untouched test set and stronger run-identity/exposure protections. This is a known tooling limitation, not observed leakage in this run.

Independent core review: [REVIEW-V3-CORE.md](REVIEW-V3-CORE.md). Conditional experimental-delivery acceptance verified the frozen binaries, all 768 final predictions and legal replay of all 120 matches. It does not certify the reusable training pipeline or deployment. Its cap-reporting condition is met by the separate unfinished-game columns above. Exact labelled datasets have also been exported into the public evidence directory; clean binary rebuilding does not require the training cache.

## What remains unsolved

The existing static feature family lacks full pin/overload reasoning, long combinations and endgame technique. Small coefficient fitting cannot fill these structural gaps. A materially stronger next study needs richer circuitry or a genuinely trained compact architecture, more varied and deeper teacher data, and a new untouched test split with longer matches. Those are future experiments, not features of this release. No model is fully optimized or demonstrated grandmaster strength.
