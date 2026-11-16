# Astra Chess

An experiment in **directly authored neural-network weights**. No pretrained chess model, optimizer, training corpus, opening book, tablebase, or game-tree search is used to choose moves.

[Play on GitHub Pages](https://clavum-figendi.github.io/astra-chess/) · [Download laptop package](https://clavum-figendi.github.io/astra-chess/downloads/astra-chess-laptop.zip) · [Measured results](docs/RESULTS.md) · [Release verification](docs/RELEASE.md)

**Experimental and unrated. Grandmaster strength has not been established.** These are sparse neural circuits encoding authored chess heuristics, not a reproduction of DeepMind's trained transformer and not evidence of general intelligence. Larger does not automatically mean stronger.

## Play

The web application runs locally in your browser after downloading its selected model. It does not send your positions to a server. Select Pocket or Atlas, a clock and your color. Both models use one fixed feed-forward computation per position; extra clock time does not increase search depth. Move scores are policy scores, not calibrated probabilities or engine centipawn evaluations.

The app automatically ends games at threefold repetition and the fifty-move threshold rather than implementing a tournament claim dialogue. Legal-move generation and these game rules are provided by chess.js and are **not encoded in the weights**. Legal generation may temporarily make/unmake moves to reject self-check; this is rule enforcement, not policy lookahead. FEN imports cannot recover repetition history.

## Laptop download

The website's `downloads/astra-chess-laptop.zip` contains both actual weight files, the generic inference runtime, the chess rules dependency, and a command-line/UCI adapter. Extract it, install Node.js 22 or later, then run:

```
node laptop/cli.mjs --model atlas
```

This starts a minimal UCI session. In a chess GUI, configure the Node executable and the absolute script path as its argument. Engines which require an executable wrapper can use a shell/batch script invoking this command. `uci`, `isready`, `ucinewgame`, `position startpos moves ...`, `position fen ...`, `go`, and `quit` are supported. `go` answers immediately after a forward pass; clocks, depth and node budgets do not trigger search. `searchmoves`, pondering and MultiPV configuration are not supported. There is no ongoing background search to stop. The GUI remains responsible for match clocks and time forfeits.

For a single position:

```
node laptop/cli.mjs --model pocket --fen "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

No npm installation, GPU, Python, account, or API key is required for the extracted laptop bundle. It is portable JavaScript plus compiled weight binaries, not a native OS executable. Linux execution is verified; Windows and macOS portability is architectural, not device-tested.

## Reproduce from source

Node.js 22+ and the `zip` utility are required to build the downloadable package.

```
npm ci --ignore-scripts
npm run weights
npm test
npm run build
npm run serve
```

Open `http://127.0.0.1:4173/`. Model generation is deterministic: tensor coefficients and sparse connections are authored by the compiler, not fitted to examples. See `docs/ARCHITECTURE.md` for the exact encoding, operations, circuit semantics, numerical representation, and limitations. `public/models/manifest.json` gives counts and SHA-256 hashes. We report full binary storage (including topology), not just float coefficients.

## Evaluation

`docs/EVALUATION.md` specifies the protocol. `evaluation/results.json` contains recorded results and model hashes once evaluated. The separate evaluation harness may play baseline opponents and read public test positions, but no benchmark label or opponent is part of deployed move selection. Puzzle figures are not Elo estimates and test-suite correctness is not chess strength.

## Sources and attribution

- Ruoss et al., [Grandmaster-Level Chess Without Search, v1](https://arxiv.org/html/2402.04494v1). Motivation only; **none of its trained weights are used**.
- Takehi et al., [Sparks of Weight-Space Programming](https://rikiyat.github.io/blog/weight-space-programming/). Motivation for constructing weights directly; no claim to reproduce its experiments.
- [chess.js](https://github.com/jhlywa/chess.js), version 1.4.0, BSD-2-Clause: legal moves, FEN/PGN and game rules. License included with distributions.
- Public Lichess puzzles redistributed by [searchless_chess](https://github.com/google-deepmind/searchless_chess), used only for evaluation; see dataset provenance in the evaluation notes.

Original implementation and generated weights: MIT. Astra directed the architecture and authored the phase-gated king-activity and rook-file circuit revision. Implementation workers were routed by Hermes to `gpt-6.1-sol`, which supplied the initial circuit compiler and UI. This is **Astra-directed, Sol-assisted authorship**, not an exclusively single-model experiment; no external pretrained policy is substituted.
