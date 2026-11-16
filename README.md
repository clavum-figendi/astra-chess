# Chess Lab

Local neural chess with browser play, a portable laptop player, configurable clocks and a weighted opening book.

[Play](https://clavum-figendi.github.io/chesslab/) · [Pocket/Atlas laptop download](https://clavum-figendi.github.io/chesslab/downloads/astra-chess-laptop.zip) · [Current changes and results](docs/RELEASE-V7.md)

## Play

Choose **Pocket**, **Atlas**, or **DeepMind 9M**. The board-first interface supports one premove, optional local sound effects, and an initially collapsed technical panel. Sound defaults off and remembers an explicit preference. Premoves are rechecked after the opponent replies; queued promotions become queens, while ordinary promotions retain all four choices.

Choose a colour and time control. The opening book is on by default: the pinned CC0 Lichess corpus provides 5,575 positions and 8,190 continuations through 32 plies, covering all 500 ECO codes. New games receive fresh random seeds; a fixed seed reproduces choices. PGNs record seed and book status. The weights reflect named-line coverage, not observed game popularity. See [book provenance](docs/OPENING-BOOK-V7.md).

Book choices and neural choices are labelled separately in the readout. Pocket/Atlas use a sparse neural forward pass plus legal masking; DeepMind 9M evaluates legal state/action pairs in batches. Neither performs game-tree search. No remote engine is called during play, and all positions stay on your device.

The active catalogue retains one Pocket (underlying Pocket+ variant) and one Atlas (original variant), selected on fresh validation. Other variants remain in source/history for reproducibility but are excluded from playing choices and packaged weights. DeepMind uses 17,991,221-byte FP16-stored transformer weights and CPU WASM; Rapid or Unlimited is recommended. Exact active artifacts and hashes are in the built `models/manifest.json`.

## Laptop

Extract the download and install Node.js 22+. No npm installation, Python, GPU or API key is needed for play.

```
node laptop/cli.mjs --model atlas --book --seed my-game
node laptop/cli.mjs --model pocket-plus --no-book
node laptop/cli.mjs --list-models
```

The first two commands start a UCI session. Configure your chess GUI to invoke Node with the absolute script path and desired arguments. `uci`, `isready`, `ucinewgame`, standard-start/FEN positions, move histories, `go` and `quit` are supported. `--fen "..."` returns a single decision as JSON. The GUI handles match clocks. Changing a depth/node budget does not add search to the player.

The browser automatically draws threefold repetition and the fifty-move rule. Imported FEN positions cannot recover earlier repetition history. Legal moves and game-end rules use chess.js independently of the neural weights.

## Build and reproduce

```
npm ci --ignore-scripts
npm run weights
npm run book
npm test
npm run build
npm run serve
```

The local server uses port 4173, configurable with `PORT`. Sparse model reconstruction uses the authored compiler and pinned fitted multiplier configurations; it does not rerun training. `public/models/active.json` controls the reduced distribution catalogue. Build output includes the selected portable player models, opening book and technical evidence. Historical unselected binaries are not copied into the distribution.

## Training and evidence

The v7 study inspected real tensors/coefficient groups, generated and fitted bounded weight candidates, and selected against 96 fresh Stockfish-labelled validation positions before exposing 93 final positions. The new sparse fits did not beat the retained variants. A small DeepMind head adjustment reduced validation policy loss while retaining the same 55/93 final bestmove matches and 3W/1D engine-match score as its control; it does not establish stronger play. See `docs/RELEASE-V7.md` and `evaluation/v0.7/`. Neural-only evaluations disable the book.

Historical versioned reports and binaries retain their original identities for reproducibility. The product and current model display names are neutral; existing repository and download URLs remain compatible.

## Sources

- Ruoss et al., [Grandmaster-Level Chess Without Search](https://arxiv.org/html/2402.04494v1).
- [Sparks of Weight-Space Programming](https://rikiyat.github.io/blog/weight-space-programming/).
- [chess.js](https://github.com/jhlywa/chess.js) 1.4.0, BSD-2-Clause, for rules and notation.
- Stockfish and GNU Chess, used offline as teachers/opponents; acquisition and licensing are recorded in `docs/ENGINE-PROTOCOL.md`.

Original sparse-policy project code and generated sparse weights use the included MIT license. DeepMind-derived weights are CC-BY-4.0; the transformer conversion/runtime code is Apache-2.0. ONNX Runtime is MIT with third-party notices under public/vendor/ort. These third-party weights are not relicensed under the project MIT license.
