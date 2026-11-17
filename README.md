# Chess Lab

Local neural chess with browser play, a portable laptop player, configurable clocks and a weighted opening book.

[Play](https://clavum-figendi.github.io/chesslab/) · [Pocket/Atlas laptop download](https://clavum-figendi.github.io/chesslab/downloads/astra-chess-laptop.zip) · [Current changes and results](docs/RELEASE-V8.md)

## Play

Choose **Pocket**, **Atlas**, or **DeepMind 9M**. The board-first interface supports one premove, optional local sound effects, and an initially collapsed technical panel. Sound defaults off and remembers an explicit preference. Premoves are rechecked after the opponent replies; queued promotions become queens, while ordinary promotions retain all four choices.

Choose a colour, time control and opening-book source. The unchanged ECO default covers 5,575 positions through 32 plies. New choices contain 3,000 Lichess 2200+ games and their 253-game rapid/classical subset, with game-frequency weights through 12 plies. New games receive fresh seeds; PGNs record seed, book/source, hash and hash algorithm. Masters is unavailable, not silently substituted. See [book provenance and limits](docs/BOOK-SOURCES-V8.md).

Book choices and neural choices are labelled separately in the readout. Pocket/Atlas use a sparse neural forward pass plus legal masking; DeepMind 9M evaluates legal state/action pairs in batches. Neither performs game-tree search. No remote engine is called during play, and all positions stay on your device.

The active catalogue retains Pocket (underlying Pocket+), the Atlas V8 contrastive coefficient derivative, and unchanged DeepMind 9M. Atlas improves held-out teacher agreement, not demonstrated Elo. Other variants remain in source/history but are excluded from playing choices and packaged weights. DeepMind uses 17,991,221-byte FP16-stored transformer weights and CPU WASM; Rapid or Unlimited is recommended. Exact active artifacts and hashes are in the built `models/manifest.json`.

## Laptop

Extract the download and install Node.js 22+. No npm installation, Python, GPU or API key is needed for play.

```
node laptop/cli.mjs --model atlas --book --seed my-game
node laptop/cli.mjs --model atlas --book-source lichess-2200-slow --seed my-game
node laptop/cli.mjs --model pocket-plus --no-book
node laptop/cli.mjs --list-models
```

The first two commands start a UCI session. Configure your chess GUI to invoke Node with the absolute script path and desired arguments. `uci`, `isready`, `ucinewgame`, standard-start/FEN positions, move histories, `go` and `quit` are supported. `--fen "..."` returns a single decision as JSON. The GUI handles match clocks. Changing a depth/node budget does not add search to the player.

The browser automatically draws threefold repetition and the fifty-move rule. Imported FEN positions cannot recover earlier repetition history. Legal moves and game-end rules use chess.js independently of the neural weights.

## Build and reproduce

```
npm ci --ignore-scripts
npm test
npm run build
npm run serve
```

The local server uses port 4173, configurable with `PORT`. The normal build uses checked-in, hash-identified weights and books; it does not rerun training. `public/models/active.json` controls the reduced catalogue. Historical unselected binaries are not distributed. `npm run weights` reconstructs historical variants and their historical manifest, not the V8 release catalogue; it is not a normal release-build step. The pure `rebuildVariant` helper in `tools/rebuild-v8-models.mjs` and its tests reconstruct V8 candidates byte-for-byte from public coefficient reports without publishing them. Books rebuild offline with `npm run book` followed by `node tools/v8-books-build.mjs`.

## Training and evidence

The V8 study tested contrastive and low-rank weight repairs, selected on 95 fresh validation positions, and evaluated 96 final positions plus 20 paired games. Atlas increased best-move matches from 21 to 25; both Atlas versions lost four games. Pocket's candidate regressed in matches and was rejected; DeepMind's edit did not improve move choices. These are not Elo or grandmaster-strength results. See [weight-repair methods and results](docs/WEIGHT-REPAIR-V8.md), including the original runtime-freeze limitation and separately bound reproducibility replay. Neural-only evaluations disable the book.

Historical versioned reports and binaries retain their original identities for reproducibility. The product and current model display names are neutral; existing repository and download URLs remain compatible.

## Sources

- Ruoss et al., [Grandmaster-Level Chess Without Search](https://arxiv.org/html/2402.04494v1).
- [Sparks of Weight-Space Programming](https://rikiyat.github.io/blog/weight-space-programming/).
- [chess.js](https://github.com/jhlywa/chess.js) 1.4.0, BSD-2-Clause, for rules and notation.
- Stockfish and GNU Chess, used offline as teachers/opponents; acquisition and licensing are recorded in `docs/ENGINE-PROTOCOL.md`.

Original sparse-policy project code and generated sparse weights use the included MIT license. DeepMind-derived weights are CC-BY-4.0; the transformer conversion/runtime code is Apache-2.0. ONNX Runtime is MIT with third-party notices under public/vendor/ort. These third-party weights are not relicensed under the project MIT license.
