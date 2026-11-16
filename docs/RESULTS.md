# Measured results — circuit revision 2

**The grandmaster-strength goal was not achieved or demonstrated.** This release is a playable, directly authored neural-circuit experiment. The larger model solves more of this sample, but neither has an established Elo.

## Frozen models

| Model | Stored numerical parameters | Full model bytes | Full size (decimal MB) | First puzzle move correct | Complete puzzle solution |
|---|---:|---:|---:|---:|---:|
| Pocket | 514,709 | 4,423,376 | 4.42 | 56 / 256 (21.88%) | 27 / 256 (10.55%) |
| Atlas | 4,375,054 | 38,397,700 | 38.40 | 112 / 256 (43.75%) | 74 / 256 (28.91%) |

Parameters count all sparse edge weights and stored biases, including zero biases. Full bytes also count sparse topology, activation flags, output map and metadata. The file size is not merely the parameter count multiplied by a precision. All numerical parameters and topology are directly authored, not learned.

The evaluation sample was fixed before benchmarking by hashing public puzzle IDs; see [protocol](EVALUATION.md). Neither compiler reads the puzzle dataset. Full-solution accuracy requires every solver move to match the reference, with reference opponent replies supplied. These percentages **cannot be compared directly** with the paper's reported scores without matching its full sample, implementation and protocol. They are not Elo estimates.

## Games against weak baselines

Eight games per opponent and model, with paired colors over four starting lines:

| Model | Opponent | Wins | Draws | Losses | Ply-limit draws |
|---|---|---:|---:|---:|---:|
| Pocket | Seeded random legal moves | 3 | 5 | 0 | 0 |
| Pocket | Greedy immediate capture/promotion | 2 | 6 | 0 | 0 |
| Atlas | Seeded random legal moves | 6 | 2 | 0 | 0 |
| Atlas | Greedy immediate capture/promotion | 5 | 3 | 0 | 0 |

These opponents have no established ratings and are intentionally weak. The frequent draws expose limitations in conversion, repetition handling and endgame technique. Undefeated against these baselines is **not evidence of master-level play**. All game records and termination reasons are retained in the repository's `evaluation/` directory.

## Measured speed

On the shared Linux x64 development host, two Intel Xeon (Skylake) virtual CPUs, Node 26.8.2:

| Model | Policy calls timed | Median | p95 | Maximum |
|---|---:|---:|---:|---:|
| Pocket | 959 | 24.08 ms | 67.45 ms | 285.73 ms |
| Atlas | 735 | 117.84 ms | 242.93 ms | 486.83 ms |

Timing includes raw encoding, legal generation, the feed-forward circuit and ranking, but excludes loading and parsing the binary. The host is shared with development/review work; these are observed timings, not controlled hardware performance claims. A real Chromium worker produced identical full top-five move/score lists to Node for the starting position with both binaries. Browser timing and interaction receipts are saved separately.

## Software verification

- 34 passing tests at the revision-2 integration checkpoint, including controlled-worker browser scenarios, clocks, graph integrity, raw encoding, tactical development fixtures and deterministic binary reproduction.
- Separate actual-weight Chromium checks: both model workers and Node agreement, human White/Black games, underpromotion, castling, en passant, imported checkmate, PGN export, real flag fall, and mobile layout/play.
- The laptop ZIP was extracted to an isolated directory and both policies answered an actual UCI sequence without installing dependencies.
- Desktop/mobile browser emulation is not physical phone or native Windows/macOS verification.
- GitHub Pages delivery and hosted-origin play are separate release gates, recorded in the final verification receipt after publication.

## Authorship and scientific boundaries

Astra directed the experiment and authored revision 2's king-activity/rook-file circuitry. The initial compiler, tactical circuits, runtime and UI were implemented with Sol assistance. This distinction is stored in the model metadata and manifest; it is not an exclusively Astra-only generation experiment. No pretrained chess network, training run, engine-labelled data fitting, opening book or tree search was substituted.

The result shows that explicit chess heuristics can be compiled into small, auditable neural weights and executed without game-tree search. It does **not** show that grandmaster chess knowledge has been compressed into these networks, nor establish the maximum capability achievable at either size.

Raw record: `evaluation/results.json`. Models: `public/models/manifest.json`. All claims above refer to the hashes recorded there.
