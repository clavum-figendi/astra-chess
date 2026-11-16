# Chess Lab

Local neural chess with browser play, a portable laptop player, configurable clocks and a weighted opening book.

[Play](https://clavum-figendi.github.io/astra-chess/) · [Laptop download](https://clavum-figendi.github.io/astra-chess/downloads/astra-chess-laptop.zip) · [Policy training and results](docs/POLICY-V4.md)

## Play

**New browser policy: DeepMind 9M.** Select it in the Policy menu. The adapted transformer runs locally through ONNX Runtime Web/WASM with 17,991,221-byte FP16-stored weights. It preserves all 207 validation move choices of the original float32 model; the smaller INT8 candidate was rejected for loss of accuracy. Rapid or Unlimited is recommended on CPUs. See [browser conversion and verification](docs/BROWSER-V6.md).

Choose a model, colour and time control. The opening book is on by default: 42 curated branches cover 340 exact positions through the first 12 plies. New games receive fresh random seeds; a fixed seed reproduces book choices. PGNs record the seed and whether the book was enabled. Switch the book off for deterministic neural-only play.

Book choices and neural choices are labelled separately in the readout. Pocket/Atlas use a sparse neural forward pass plus legal masking; DeepMind 9M evaluates legal state/action pairs in batches. Neither performs game-tree search. No remote engine is called during play, and all positions stay on your device.

Available families: Pocket and Atlas; expanded Plus variants; score-fitted Tuned variants; and new Policy variants fitted to Stockfish's chosen moves and MultiPV rankings. Only the selected binary is loaded. Exact sizes, parameters and hashes are in `models/manifest.json`.

## Laptop

Extract the download and install Node.js 22+. No npm installation, Python, GPU or API key is needed for play.

```
node laptop/cli.mjs --model atlas-policy --book --seed my-game
node laptop/cli.mjs --model pocket-policy --no-book
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

The local server uses port 4173, configurable with `PORT`. Model reconstruction uses the authored compiler and pinned fitted multiplier configurations; it does not rerun training. Build output includes the portable player, all available models, opening book and technical evidence.

## Training and evidence

Policy fitting uses direct Stockfish best-move targets mixed with ranked alternatives, not raw-score regression. Geometry-specific coefficients expand the fitted degrees of freedom while preserving the sparse backbone and single-pass runtime. Stockfish depth-6 self-play produces fresh training/validation/test data, split by opening family and excluding earlier measured positions. See `docs/POLICY-TOOLS.md` and `evaluation/v0.4/` for objectives, frozen hashes, measured agreement and engine matches. Neural-only evaluations disable the opening book.

Historical versioned reports and binaries retain their original identities for reproducibility. The product and current model display names are neutral; existing repository and download URLs remain compatible.

## Sources

- Ruoss et al., [Grandmaster-Level Chess Without Search](https://arxiv.org/html/2402.04494v1).
- [Sparks of Weight-Space Programming](https://rikiyat.github.io/blog/weight-space-programming/).
- [chess.js](https://github.com/jhlywa/chess.js) 1.4.0, BSD-2-Clause, for rules and notation.
- Stockfish and GNU Chess, used offline as teachers/opponents; acquisition and licensing are recorded in `docs/ENGINE-PROTOCOL.md`.

Original sparse-policy project code and generated sparse weights use the included MIT license. DeepMind-derived weights are CC-BY-4.0; the transformer conversion/runtime code is Apache-2.0. ONNX Runtime is MIT with third-party notices under public/vendor/ort. These third-party weights are not relicensed under the project MIT license.
