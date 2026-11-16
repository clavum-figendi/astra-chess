# Browser transformer release

Select **DeepMind 9M** in the Policy menu. It runs locally on CPU through ONNX Runtime Web 1.24.3/WASM, in a Web Worker. No server inference, API key, WebGPU or cross-origin-isolation headers are required. Existing clocks, opening-book controls and PGN export remain available. Rapid or Unlimited is recommended; CPU inference takes several seconds on the test host.

## Compression selection

All candidates derive from the frozen adapted checkpoint `05a434c6925312fc02323c3015d187d78016cef6ecc6485bbc9da0fcc4d3d264`. Selection used the 207-position validation set, not the final test set. The predeclared rule requires at least 95% agreement with float32 choices and at most two lost teacher matches.

| Candidate | Model bytes | Same validation choices | Stockfish teacher matches |
|---|---:|---:|---:|
| Float32 ONNX | 35,887,968 | 207/207 | 126/207 |
| Dynamic INT8 | 10,869,952 | 104/207 | 82/207 |
| **FP16 storage, selected** | **17,991,221** | **207/207** | **126/207** |

The INT8 candidate is not shipped: its size saving costs too much accuracy. FP16 storage casts weights back to float32 for WASM computation. It reduces transfer/storage size, **not activation precision or runtime memory by the same ratio**. The 12,361,745-byte WASM runtime and JavaScript glue are additional downloads, cached normally by the browser. Only selected policy weights are fetched during play.

Selected ONNX SHA-256: `4faa374e93c82e92f4f443cf36d9d2fdc98e22d69991cdc6d0d6a3ecdbe3957e`.

## Runtime and evidence

Final held-out ONNX evaluation preserved **147/147** PyTorch choices and **85/147** Stockfish teacher matches, without changing the selected artifact. Actual Chromium execution preserved all **32** held-out choices exercised through the packaged Worker; median inference was **5,247.4 ms** and maximum **7,792.4 ms** on the test CPU. A separate final smoke covered cancellation during inference and sampled Chrome-process RSS (about 659 MB summed RSS, including shared pages—not exclusive model RAM). These timings and memory samples are host-specific.

The model scores every legal state/action pair using its learned encoder and 128 return buckets; it does not perform game-tree search. The opening book, when enabled, is an explicitly separate first-choice layer. History-based repetition overrides preserve the original reference convention. Scores are labelled expected returns, not move probabilities.

- `evaluation/v0.6/python-onnx-evaluation.json`: complete validation comparison and selected variant.
- `tests/fixtures/deepmind-token-contract.json`: all 1,968 action IDs and token fixtures generated from the verified Python implementation.
- `tests/transformer-contract.test.mjs`: full action-order parity, FEN encoding and history regression checks.
- `tools/browser-transformer-e2e.py`: real UI and Worker execution, independent book toggle and position comparisons.
- `evaluation/v0.6/browser-integrated.json`: packaged browser execution receipt when complete.
- `evaluation/v0.6/browser-live.json`: hosted execution receipt when complete.
- `docs/REVIEW-V6-BROWSER.md`: independently scoped review when complete.

The initial `browser-probe.json` is historical debugging evidence, not a fidelity certificate: its adapter had incorrect action ordering and staging-specific paths. The production adapter fixes these, with exhaustive action-ID regression coverage. Do not use that initial probe's move or timing as a release result.

Earlier eight-game engine-match scores belong to the float32 pretrained/adapted models, not a new browser Elo rating. Preserving measured moves does not establish grandmaster strength or equality on every possible position.

## Attribution

Original architecture/checkpoint: Google DeepMind [searchless_chess](https://github.com/google-deepmind/searchless_chess/tree/90ae0e6b121673fc3079aaeffa047580bb600c0a), checkpoint `9M/6400000/params`. Weights are [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Modifications: Haiku-to-PyTorch conversion, Stockfish-policy head adaptation, ONNX export and FP16 storage conversion. No endorsement is implied.

Transformer runtime/conversion code is Apache-2.0. ONNX Runtime is MIT; its license and third-party notices are bundled in `vendor/ort/`. The original sparse policies retain their separate project license.
