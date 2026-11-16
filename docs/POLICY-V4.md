# Chess Lab v0.4: policy distillation and varied openings

## Delivered changes

- Neutral Chess Lab branding in the player, UCI identity, current README and model catalogue. Historical evidence and compatible repository/download URLs retain their identities.
- A weighted opening book with 42 legally replayed branches and 340 exact positions, through 12 plies. New games generate random seeds; fixed seeds reproduce choices. Book enabled/disabled and seed are recorded in PGNs. Book moves are labelled separately from neural scores.
- Pocket Policy and Atlas Policy: Stockfish move-policy distillation with 1,031 and 1,965 independently fitted coefficient groups, respectively, versus the preceding fitter's 64 and 82. Existing graph topology and generic single-pass runtime are retained; capacity is increased by untying geometry-dependent coefficients, not adding padded nodes.
- Pocket Policy changes 45,345 stored weights; Atlas Policy changes 481,257. Complete files are 8,466,268 and 41,074,768 bytes. All eight available models can be selected in the browser and laptop CLI.

## Training

Stockfish 17.1 generated fresh trajectories from the curated opening branches. Each position was analyzed at depth 6 with complete same-depth MultiPV coverage of every legal move. The recorded bestmove must equal rank 1, and PV roots must match their labelled moves. Both numerical evaluation and PV are retained for audit, but policy training uses the chosen move and ranks—not centipawn regression.

The target is 75% hard bestmove plus 25% normalized exponential rank distribution. Sparse Adam minimizes cross-entropy with bounded multipliers. Validation cross-entropy selects the checkpoint, with top-1 as a tie-breaker. Both families selected round 1, then stopped after two further non-improving rounds. Cross-entropy improvement does not necessarily improve the top-ranked move, as the measurements below illustrate.

Dataset: **458 training, 219 validation, 159 final-test positions**. Opening families are grouped by the first four SAN plies before hash-based split assignment; exact piece-placement/side identities are unique across splits, and all earlier v0.3 measured positions are excluded. A fresh process starts each trajectory; hash is warm within a trajectory, explicitly unlike the older per-position-reset experiment. Teacher play occasionally selects a close rank-2 alternative for variety. Exact code, protocol, engine and data hashes are recorded.

The two candidates were serialized and frozen before opening the final test. v0.4 generation and fitting refuse a final-test exposure marker; the evaluator binds it to the exact selected configuration. No fitting followed final-test inspection. This run used local CPU compute; no Modal/Daytona job or cloud charge occurred.

Reconstruction needs no teacher: `npm run weights` rebuilds the original models and both generations of fitted variants from pinned configurations. `npm run book` reconstructs the book. Full API details are in [POLICY-TOOLS.md](POLICY-TOOLS.md).

## Held-out move-policy measurements

All 159 positions were evaluated with the opening book **off**, using actual serialized binaries. Top-1 is exact agreement with Stockfish's chosen move; lower mean rank is better.

| Model | Top-1 agreement | Mean teacher rank |
|---|---:|---:|
| Pocket | 22.64% | 8.77 |
| Pocket+ | 21.38% | 9.26 |
| Pocket Policy | 21.38% | 9.61 |
| Atlas | 23.27% | 7.65 |
| Atlas+ | 23.27% | 7.65 |
| Atlas Policy | 22.64% | 9.18 |

The new training objective and additional free coefficients did not improve held-out move agreement over the respective Plus parents. Their mean ranks regressed. The player therefore retains its existing model defaults; new policies are selectable comparisons rather than automatic replacements.

## Actual-engine games

Six policies each played 16 games: paired colours from four test opening families, against Stockfish at depth 3 and GNU Chess at depth 1. The book was off, full history preserved, and the ply cap was 160.

| Model | Wins | Losses | Rule draws | Unresolved caps |
|---|---:|---:|---:|---:|
| Pocket | 0 | 16 | 0 | 0 |
| Pocket+ | 0 | 16 | 0 | 0 |
| Pocket Policy | 0 | 15 | 0 | 1 |
| Atlas | 0 | 15 | 0 | 1 |
| Atlas+ | 0 | 15 | 0 | 1 |
| Atlas Policy | 0 | 14 | 1 | 1 |
| Total | 0 | 91 | 1 | 4 |

The one rule draw is repetition; caps are unfinished games, not adjudicated draws. These games measure neural-only play under the specified engine limits. Opening variety is separately verified through seeded book/browser/CLI tests and is not represented as a neural-strength gain. The data do not establish a broad strength improvement.

## Verification and evidence

- Independent core review: [REVIEW-V4-CORE.md](REVIEW-V4-CORE.md), including exact book eligibility, imported-FEN handling, both-client parity and direct policy targets.
- 80 local tests passed with zero failures/skips, including actual engine and browser tests.
- Fresh source/dataset checks confirmed disjoint board IDs and opening families, no overlap with v0.3, and all reviewed source bindings (including the explicitly reviewed build-version delta).
- `evaluation/v0.4/data-protocol.json`: trajectory PGNs, generation settings and hashes.
- `evaluation/v0.4/data/`: exact teacher labels.
- `evaluation/v0.4/optimization.json`: all rounds, baseline/selected metrics and changed-weight counts.
- `evaluation/v0.4/final-results.json` and `matches.pgn`: frozen policy predictions, every engine game and separately classified outcomes.
- `public/models/policy-config.json`: pinned base hashes, coefficients and expected complete-binary hashes.

The review's two non-blocking hardening recommendations are retained: production joins should explicitly compare complete legal/label/feature sets, and CLI/worker book validation should follow the same reconstruction path. This shipped curated map is verified against its compiler and cross-client parity; it is not silently substituted with external game data.
