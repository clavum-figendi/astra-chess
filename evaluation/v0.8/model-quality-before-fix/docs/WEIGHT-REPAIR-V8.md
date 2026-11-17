# V8: bounded contrastive weight-repair experiment

These experiments change stored neural weights, not the game's search budget. There is still no game-tree search in deployed inference. Opening-book choices are a separate, optional layer and were disabled for every model comparison below.

## What changed

- **DeepMind 9M:** a constrained rank-one correction was folded into the existing 128 × 256 action-value head. The encoder, bias, topology and parameter count stayed unchanged. All 32,768 head weight scalars changed, but neither reused-development nor fresh-validation move choices improved. The current checkpoint remains the control; this is head tuning, not full-model training or newly authored DeepMind knowledge.
- **Pocket and Atlas:** full-legal contrastive fitting adjusted grouped terminal coefficients. Teacher mass is 75% best move plus 25% over the supplied ranked alternatives; unranked legal moves have zero target mass and remain genuine negatives. There is no raw-centipawn regression. One ablation preserved direct material coefficients; another allowed bounded enemy-material adjustments. Nonterminal weights, biases and topology stayed unchanged.
- The material-relaxed candidates changed **65,303 Pocket** and **815,429 Atlas** weight scalars. Parameter counts remain **980,468** and **4,375,054**. Parent readback independently checked changed counts, terminal-only changes, bounds, unchanged topology/biases and unchanged large-magnitude protected coefficients where present. Extra file bytes are metadata, not extra neurons.

The diagnosis used actual wrong-move score contributions and feature sensitivities. A sensitive hidden coordinate was not labelled as a chess concept. Most material coefficients reaching their permitted bound is not evidence that wider bounds would generalize.

## Data and decision discipline

Fitting used the existing 435 training and 207 development-validation positions with depth-10 Stockfish ranked-policy targets. Those reused development results are not a fresh strength test.

A new depth-12 dataset contained **95 validation and 96 final positions**, split by whole opening family and disjoint from 2,198 previously used board/side identities. Controls win equal validation hit counts. Candidate identities and first-party inference sources were frozen before final testing; no candidate was retuned after the final results.

The original execution freeze omitted some runtime dependency/opponent bindings. That limitation remains explicit in [`PROVENANCE-LIMITS.md`](../evaluation/v0.8/PROVENANCE-LIMITS.md). A later fixed-candidate replay, when accompanied by a completed and independently verified receipt, establishes reproducibility in its recorded environment only. It is not a new holdout or retroactive proof of the original environment.

## Observed final results

| Policy | Best-move matches / 96 | Four paired games versus depth-3 Stockfish |
|---|---:|---|
| Current DeepMind 9M | 49 | 3 wins, 1 draw |
| Current Pocket | 22 | 3 losses, 1 draw |
| Pocket material-relaxed candidate | 32 | 4 losses |
| Current Atlas | 21 | 4 losses |
| Atlas material-relaxed candidate | 25 | 4 losses |

The Pocket candidate was **rejected** despite better teacher agreement because its paired outcomes regressed. DeepMind's unchanged control won selection. Atlas met the numeric teacher-agreement/non-regression gates, but equal four-loss match records do **not** demonstrate stronger play. Its eligibility is separate from final release acceptance.

All games used two openings with colors reversed, one Stockfish thread, 16 MiB hash, no book and a 160-ply cap. No game in this sample hit the cap. Caps would remain unresolved, not count as scored draws. Depth-3 Stockfish is a shallow opponent; these results establish neither Elo nor grandmaster strength.

## Verification and authorship

The parent audit independently checked all 191 new legal masks, replayed all 20 PGNs and 1,403 plies, reproduced all 384 sparse-policy held-out choices, and sampled 14 DeepMind raw-position/history decisions. The DeepMind sample is not an exhaustive second execution of all its game decisions.

Astra directed and integrated this experiment; Sol-assisted workers implemented the candidate fitting and book pipeline. The learned 9M backbone originates from Google DeepMind's `searchless_chess`, with its existing attribution and weight license retained. The sparse models originate from authored circuits with learned coefficient derivatives. None should be described as exclusively Astra-authored grandmaster weights.

Evidence: [`weight-manifest.json`](../evaluation/v0.8/weight-manifest.json), [`selection.json`](../evaluation/v0.8/selection.json), [`final-results.json`](../evaluation/v0.8/final-results.json), [`parent-verification.json`](../evaluation/v0.8/parent-verification.json), and the preserved original fitting-source copies. Historical results and failed confirmation attempts remain separately named rather than overwritten.
