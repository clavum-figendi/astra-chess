# Chess Lab v0.8 — book choices and Atlas weight repair

## Play and downloads

[Play Chess Lab](https://clavum-figendi.github.io/chesslab/) · [Pocket/Atlas laptop runtime](https://clavum-figendi.github.io/chesslab/downloads/astra-chess-laptop.zip) · [Atlas weights](https://clavum-figendi.github.io/chesslab/models/atlas-v8.bin)

The browser offers Pocket, Atlas and DeepMind 9M, with bullet, blitz, rapid, unlimited and custom clocks. Premoves, optional sound and the play-first layout remain. The DeepMind checkpoint and its [existing Python/PyTorch laptop bundle](https://github.com/clavum-figendi/chesslab/releases/download/v0.7.0/chess-lab-9m-laptop.zip) are unchanged; Rapid or Unlimited is recommended for that model.

## New book choices

- **ECO repertoire:** the unchanged default, covering 5,575 positions through 32 plies. Weights represent named-line coverage.
- **Lichess 2200+ — blitz / rapid / classical:** a bounded sample of 3,000 actual games, 12,332 runtime positions through 12 plies.
- **Lichess 2200+ — rapid / classical:** the 253-game slow subset of that same corpus, 1,556 positions through 12 plies.

Both players in the empirical sample had Lichess ratings of at least 2200. These are not FIDE ratings, titled-player guarantees or full-database popularity estimates. The official exports are CC0; the full license and source receipts are included. Masters is not included: anonymous explorer requests returned HTTP 401 and redistribution rights for its data were not established.

Book misses use the selected neural policy. PGN exports now round-trip through chess.js and include `Seed`, `Book`, `BookSource`, `BookHash` and `BookHashAlgorithm "SHA256"`. The laptop CLI supports `--book-source eco`, `lichess-2200` or `lichess-2200-slow`, and the UCI `BookSource` option. No remote engine or opening-explorer API is called during play.

## Weight change

Atlas uses the bounded material-relaxed contrastive candidate: **815,429 terminal coefficients changed**, with the same **4,375,054 parameters**, topology and biases. Its binary is **38,397,944 bytes**, SHA-256:

`c183d35facdf6c831331e7b9a82ca9b0b58c87e8f32f334a4c76df7a3d97ef66`

On the 96-position final set, Atlas matched the depth-12 teacher's best move **25 times versus 21** for its control. Both versions lost all four paired games against depth-3 Stockfish. This is a teacher-agreement improvement with no detected regression in that small match sample—not demonstrated stronger play, Elo or grandmaster strength.

Pocket's candidate improved teacher agreement but worsened paired outcomes, so its existing weights remain. DeepMind's rank-one head edit did not improve validation choices; its existing weights also remain. Historical controls are preserved in the source repository, outside the active playing catalogue.

See [the full experiment](WEIGHT-REPAIR-V8.md) and [provenance limitations](../evaluation/v0.8/PROVENANCE-LIMITS.md). A separately bound, fixed-candidate replay reproduces the results; it does not turn already-exposed positions into another independent test or repair the original incomplete runtime freeze.

## Delivery and safety

Runtime inference remains searchless. The optional books are separate from neural-only evaluation. Browser assets run locally after loading; the extracted sparse laptop runtime needs Node.js but no npm dependencies, GPU, account or API key. It was exercised outside the project with no external chess.js package available.

Raw HTML research evidence is distributed as inert `.html.txt` copies with a digest map; original evidence remains in the source repository. Failed experiments and failed verification attempts are preserved and labelled rather than overwritten. See the versioned review and verification receipts under `evaluation/v0.8/` for exact scope and artifact hashes.
