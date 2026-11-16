# Final independent software review

## Separate verdicts

**Specification delta: PASS — F1 is corrected; the narrowed software gate is clear.** The contradictory Astra-only summaries identified in `REVIEW-SPEC.md` are now qualified. This does **not** retroactively satisfy exclusive Astra authorship: the original compiler/runtime/UI were Sol-assisted. That original requested constraint remains incomplete unless the user explicitly accepts the disclosed scope change.

**Code quality / security: APPROVED for honestly labelled experimental software.** No release-blocking functional or security defect was found in the inspected implementation and targeted execution. This is not approval as a grandmaster-strength engine, an established Elo, an exclusively Astra-authored experiment, or a production-hardened service.

**Original grandmaster goal: UNMET / NOT DEMONSTRATED.** Weak benchmark results and the explicit disclaimers must remain visible. Publication, exact final archive verification, clean restoration and hosted-origin play are separate gates; this reviewer does not claim those gates have passed.

## Scope and independence

Reviewed `/home/hermes/projects/astra-chess`, with no resolvable Git `HEAD` at initial inspection. The hashes below, not a commit, bind this verdict. Read the relevant prior specification report, the current browser HTML/app/worker, all runtime modules, compiler, CLI/UCI, build/local server, dependency lock, release-check script, attribution/results documentation and targeted tests. Implementation and models were not edited; no commit, push or publication was performed. The only repository file written by this reviewer is this report.

Did not inspect held-out puzzle labels, `.cache/puzzles.json`, per-puzzle answers or the raw benchmark record. The benchmark's scientific validity and aggregate results are not newly certified by this review. Existing comprehensive specification and real-weight browser evidence remain separately scoped in `REVIEW-SPEC.md`; they are not represented as new executions here.

An initial full `npm test` invocation was interrupted by the backend without a persisted terminal verdict. It is **not counted as a successful test run**. After resumption, the targeted run below returned a complete passing verdict. The parent's isolated clean-restore verification was running separately and is not claimed as this reviewer's execution.

## F1 delta verification

- `public/index.html:7`: meta description now says **Astra-directed, Sol-assisted**.
- `public/index.html:21`: main disclosure includes **Astra-directed · Sol-assisted**, experimental/unrated status and no established Elo.
- `public/index.html:46-47`: detailed method distinguishes Sol implementation assistance from Astra's strategic revision; download disclosure explicitly qualifies coefficients/topology as Astra-directed, Sol-assisted.
- `laptop/protocol.mjs:12`: UCI emits `id author Astra-directed, Sol-assisted`. The engine's product name is not treated as a claim of exclusive authorship.
- The public results section explicitly says the grandmaster goal has not been achieved or demonstrated, links the results/raw record, and does not claim Elo. README, binary metadata/compiler and manifest agree on mixed authorship.
- Browser regression assertions for the meta/banner disclosure and the UCI author regression passed in the targeted run. Actual current CLI execution with **both real frozen binaries** also emitted the corrected author identity.

The numerical artifacts retain the supplied frozen SHA-256 values. No model rewrite was needed to correct attribution. The app, worker, engine, clock, parser and compiler hashes match the prior specification receipt; the HTML/protocol and their disclosure assertions are the relevant source delta.

## Quality / security assessment

| Area | Assessment and evidence |
|---|---|
| Error handling and cancellation | App requests have IDs, expected response types and finite load/move timeouts (`public/app.mjs:166-194`). Worker identity, generation and unchanged FEN are checked before applying a reply; reset/finish terminates the worker and rejects pending requests (`:118-122,224-239`). Worker load versioning and aborts prevent an older load becoming current. Worker fetch failures and malformed requests produce correlated errors, not fallback-engine behavior. Targeted worker and browser reset tests passed. |
| Clocks and late moves | Monotonic elapsed-time accounting is settled at interaction boundaries, flag precedes increment, and a flagged clock cannot restart (`src/clock.mjs`). Model load is untimed; inference is charged; late replies are rejected before applying a move. Promotion/resignation dialogs do not pause time. Unit tests and controlled-browser flag/loading tests passed. Timeout-material and automatic draw conventions are disclosed rather than represented as complete FIDE adjudication. |
| Model dimensions, topology and numeric bounds | Parser validates magic/version, bounded dimensions/metadata, exact total length, CRC, JSON-object metadata, ordered row ranges, finite weights/biases, activation flags, strictly preceding source indices and output bounds before inference (`src/network.mjs:14-61`). Engine requires 768 inputs/20,480 outputs and rejects non-finite selected scores. Corrupt graph and arbitrary affine/ReLU tests passed. The generic API is not a promise of finite arithmetic for every adversarial graph: overflow is possible, but chess selection fails closed on non-finite legal outputs. |
| Inference and source provenance | The current engine makes one network forward pass on raw current-position occupancy, then masks/ranks legal moves; no hidden search, engine, labels, training or remote scorer was found. The compiler emits the full arithmetic graph and has no dataset/training imports. Its candidate-conditioned attack geometry is compiled circuitry, not a successor-board inference loop. Rules come from the explicitly pinned chess.js dependency. This is inspectable source/artifact evidence, not proof of historical author-LLM training exposure. |
| CLI/UCI | Model IDs are allowlisted and model paths are fixed relative to the script, not shell-expanded input. Invalid UCI positions invalidate the old board rather than silently reusing it. Repetition history is retained by the protocol; invalid-position and repetition tests passed. Actual Pocket and Atlas CLI runs returned moves with the corrected attribution. Minimal synchronous UCI/search-budget/pondering limitations are documented; no ongoing search cancellation is promised. |
| Injection and privacy | FEN errors, notation, manifest names and worker output use text nodes; HTML sinks are fixed templates and chess.js piece enums. Runtime imports are fixed local modules, requests target same-origin model resources, and manifest artifact URLs are constrained to the model directory. No position upload, telemetry, WebSocket, external scorer, credentials, dynamic code execution or user-controlled shell command was found in the inspected play path. Same-origin hosting remains a trust boundary; the CRC/size checks are corruption detection, not publisher authentication. |
| Packaging and dependencies | Build vendors chess.js ESM and its license, copies runtime/models/docs/evaluation into the laptop bundle, and invokes `zip` through argument-vector `execFileSync`, not a shell. Only chess.js 1.4.0 is in the lock, with registry integrity recorded. `tools/verify-release.py` restores dependencies with `--ignore-scripts`, tests/builds a scratch copy and exercises extracted UCI. Its source was reviewed, but the parent's running clean-restore result and final delivered archive are outside this verdict. Do not silently equate a later documentation repack with an earlier tested ZIP digest. |
| Local serving boundary | `tools/serve.mjs` binds loopback and rejects decoded lexical traversal; its targeted traversal/404/module test passed. It is a convenience server for a trusted generated distribution, **not** a hardened sandbox for arbitrary directory trees: `readFile` follows symlinks and dotfiles are not filtered. Inspection found no symlinks in the current public/source/laptop/docs/evaluation inputs. Do not repoint it at a private tree, add private aliases, or expose it as an untrusted multi-user hosting service without realpath/dotfile hardening. This limitation is not a blocker for the present static generated artifact/loopback use. |

No paid/network vulnerability scanner was run, and no broad claim of dependency-CVE clearance is made. These conclusions are source review plus the named tests, not a penetration-test certificate.

## Executed targeted verification

```sh
ASTRA_BROWSER_TESTS=1 \
ASTRA_CHROMIUM=/home/hermes/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell \
node --test tests/clock-ui.test.mjs tests/clock-worker.test.mjs \
  tests/clock.test.mjs tests/engine-network.test.mjs \
  tests/laptop.test.mjs tests/server.test.mjs
```

**Actual terminal result: 18 tests passed, 0 failed, 0 cancelled, 0 skipped; 30,432.780541 ms.** The five browser contracts use a controlled worker/manifest; they establish UI, attribution, promotion, cancellation, timing and layout contracts, not fresh actual-weight browser parity.

Also executed, independently for each model:

```sh
printf 'uci\nisready\nposition startpos moves e2e4\ngo\nquit\n' | node laptop/cli.mjs --model pocket
printf 'uci\nisready\nposition startpos moves e2e4\ngo\nquit\n' | node laptop/cli.mjs --model atlas
```

Both exited successfully and emitted `id author Astra-directed, Sol-assisted`, `uciok` and `readyok`. Actual moves: Pocket `bestmove b8c6`; Atlas `bestmove g8f6`. These were current source-tree CLI executions with actual models, not newly extracted-package execution.

## SHA-256 review receipt

The following are actual source/artifact hashes captured during this review. CSS and saved binaries are associated artifact bindings; CSS was not separately exhaustively audited. This report intentionally omits held-out evaluation content. Later source changes require a delta review; later delivery ZIPs require their own verification.

| Path | SHA-256 |
|---|---|
| `public/index.html` | `5aa9d40fc7a021e59cd2a5a4ad258efc2b3d482180762e63d493823ad6da7154` |
| `public/app.mjs` | `192f94c97e467b1f19ff16af1938ac79eab96006f34cc31df8b2a1a98bf2b4af` |
| `public/worker.mjs` | `3d25905ad766295c42370f5ebc90ad2b7c754d6119216ee393bebab12649bcec` |
| `public/style.css` | `4dd0f3bb43bec77224d1bd0852dd754095834b9d1275d6d9370439bb9a3e9f8d` |
| `public/models/manifest.json` | `6d9d1c229da65167ca669afa77f64eb671ae38809d10da12e61b87b9f7189024` |
| `public/models/pocket.bin` | `77365eb86c5176255e06784592f9022a36ca6730c0dd3e4ce552cbf480762737` |
| `public/models/atlas.bin` | `45b639b0d0584b93aa472cef413c104b174d488ebc922d1c1b774c4b23cdcb85` |
| `src/chess.mjs` | `50e77eeb7df13b537f4d0e681852369c7ebb85e63915373fa5ef2d6359611859` |
| `src/engine.mjs` | `5a381f2ca3b0c4a0d99115b6fef616ae8a6239cc3e802d27e7f26d0edbfe57b7` |
| `src/network.mjs` | `f46d3a8fe19809c8780d69bc323707f3287de90582b66eba0ece30c4cbc5fd28` |
| `src/clock.mjs` | `19355b93e1394a13d55c9a39d8d4a12c78093826b35edf862de7fc0c2128d6b0` |
| `laptop/cli.mjs` | `c005c83fee3342a980bf24f93906053272bc74984bd9b63f0fb31efed4d455b4` |
| `laptop/protocol.mjs` | `546a22f91c2c982367af388e0ef371646b5256a43db3f222cc39bb742518b8bb` |
| `tools/build.mjs` | `9a7f6a6d2e817f4c36f5329cfc4809d233246d0f2296f222b47aaf2158e91e02` |
| `tools/serve.mjs` | `f02aa80dc15e520e77e708e70d44dac2d1726123fc9659e5925bb6b9a1a1e83d` |
| `tools/compile-models.mjs` | `84106e32cb3bdb39f01dcab43c746585ff217069c278c020fcf3ba1201305ece` |
| `tools/verify-release.py` | `a17beb0859c0781006ac01c5235672149f78986b30c29fb368fc9c669e11ac46` |
| `package.json` | `7380bf69004d9d149722602fc0a73feef16f34ca6f4b1983f34ef90a7452921b` |
| `package-lock.json` | `90cf04009a4a5131c86af8acc0d0e68332f189023a8b202ddce2b1931c5cce87` |
| `README.md` | `bb9e8f42b71c20aefb7533427627ef2b99aac1106fc5083fbc8e063b60b1222b` |
| `docs/RESULTS.md` | `bf14edf7e6e13195a3890117370a62b966d775c9f5a1bc28796a0ed7b45c86f3` |
| `tests/clock-ui.test.mjs` | `dd5a1c1f51d052e55209f84a5d90606ab25a26fe32d3c212079bb722b4e3f31c` |
| `tests/clock-worker.test.mjs` | `10fc86e8bc83b4195fce012b4813d4bf58f228b8fdb12be6a1ae01f3ac73e747` |
| `tests/clock.test.mjs` | `9f8a9fe25e026407d573e745ff236916f55f7eb5b9c377a5101e3a308adcfcf9` |
| `tests/engine-network.test.mjs` | `496341cae7f596a6bf3ae7f312a6a7588f20443a1d7d1ae0d4ab33080e295194` |
| `tests/laptop.test.mjs` | `0c17c7133cb6f534cd8ec4f9c3153ff126593fb630fd7797d837f308068d65fc` |
| `tests/server.test.mjs` | `97f5822181d55641da8707c87e710f79c41d8215d0fb7d534831db3e90ea59ff` |
