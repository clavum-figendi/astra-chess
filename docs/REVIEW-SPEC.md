# Independent specification review

## Verdict

**The frozen neural implementation conforms to the narrowed authored-circuit software design. Final acceptance is not an unconditional pass.** No blocking functional defect was found in the reviewed inference, compiler, worker, clock, browser, laptop, or build paths. There is a **release-blocking provenance inconsistency** in the front-page and UCI attribution (F1 below). The original exclusively-Astra authorship condition is not established/satisfied by the disclosed mixed authorship; changing that acceptance condition requires an explicit scope decision, not a green software test.

**Grandmaster capability remains an unmet scientific goal.** It is not a software gate passed, an established Elo, or something these tests establish. Passing this review must never be presented as completing the original grandmaster-strength target.

Benchmark aggregate results and the parent's broader local-browser receipt were subsequently checked in the addendum below. Final source/archive publication, hosted-origin checks and live GitHub Pages play remain outside this review's completed evidence. This report does not authorize or claim deployment.

## Scope and method

Repository: `/home/hermes/projects/astra-chess`. Reviewed the actual `PLAN.md`, source, compiler, saved model metadata/manifest, interfaces and tests, not only previous reports. The repository had no resolvable `HEAD` when inspected, so this review is bound to the SHA-256 receipt below rather than a commit. No implementation, weights or evaluation sample were changed. The reviewer did **not** inspect `.cache/puzzles.json` or per-puzzle expected/actual moves, and did not run the held-out benchmark; only aggregate result fields/counts were inspected in the addendum. No paid API, commit or push was used.

The runtime/compiler/UI source hashes did not change during the isolated build/play probe or the subsequent receipt comparison. Concurrent later additions or source changes require their own delta review; this receipt must not silently be relabeled as covering them.

## Findings

### F1 — Medium, provenance; fix before publication

The detailed attribution is candid, but several user-visible interfaces still present the initial implementation/weights as Astra-only:

- `public/index.html:7`: the description says “Astra-authored neural chess policies”.
- `public/index.html:21`: the main disclosure says “Astra-authored weights”.
- `public/index.html:46`: the download disclosure says “Original Astra-authored coefficients and topology”.
- `laptop/protocol.mjs:10-13`, specifically line 12: UCI emits `id author Astra` with no Sol attribution. This was reproduced from both extracted model variants.

This conflicts with `README.md:56`, `docs/ARCHITECTURE.md:7`, `public/index.html:45`, `tools/compile-models.mjs:341,413`, and the saved binary metadata/manifest, which correctly disclose **Astra-directed, Sol-assisted** work. The supplied context identifies the initial workers as `gpt-6.1-sol`, with Astra's directly authored addition at `tools/compile-models.mjs:226-260`.

**Required correction:** use consistent Astra-directed/Sol-assisted attribution in these summaries and UCI identity, preserving the distinction between Astra's architecture/strategic revision and Sol's initial implementation. This does not require changing numerical weights. Re-review the changed UI/protocol hashes and rerun affected interface tests after correction. It is a provenance defect, not evidence of pretrained weights or a broken neural runtime.

### A1 — Original authorship acceptance condition needs a scope decision

`PLAN.md:3` records “Astra-authored weights only”; the supplied original acceptance context is stricter than mere absence of pretrained weights. The reviewed compiler and documentation disclose mixed-model authorship. The narrower facts **original directly authored weights, no imported pretrained policy, and honest mixed attribution** are supported; **exclusive Astra authorship** is not. Accurate disclosure is necessary but does not retroactively meet that literal original condition. Do not report exclusive authorship as passed without the user's acceptance of the disclosed adjustment.

### A2 — Scientific target and remaining release gates are not completed by this review

- Original grandmaster-level play: **unmet/unestablished scientific goal**, not a code defect and not waived into success by packaging.
- The evaluation harness/protocol is separate from inference. Final aggregate results were validated in the addendum, but the held-out sample's selection/correctness and individual solution judgements were not independently audited here. The measured results do not establish grandmaster strength.
- `PLAN.md:30` publication/tag/remote read-back/live-browser gate has not been verified here. Local browser success is not hosted-origin evidence.

These are explicit acceptance/evidence boundaries, not additional functional bugs. This report does not turn them into completed gates.

## Specification evidence

| Requirement | Result and source evidence |
|---|---|
| Genuine full saved neural circuit | **Pass.** `tools/compile-models.mjs:283-369` serializes the complete sparse affine/ReLU DAG: row pointers, biases, activation flags, source indices, numerical edge weights, and output indices. `src/network.mjs:14-61` parses it; `:64-78` uses generic weighted sums and ReLU only. Saved files are not tiny coefficient lists backed by a hidden runtime evaluator. |
| Raw board input | **Pass.** `src/engine.mjs:28-41` encodes 768 binary own/enemy piece-square values, Black rank-reflected with files retained. Castling/en-passant/history/counters are not engineered scoring features; legal/game-end masking may use them. |
| No hidden runtime chess scoring/search | **Pass for the reviewed selection path.** `src/engine.mjs:6-23` performs one `forward` call on the current raw board, then indexes legal moves, orders score/lexical ties and returns top five. No successor board is sent through the network, no chess value table is read at runtime, and there is no fallback engine. Candidate-conditioned geometry exists in the compiler and becomes saved arithmetic; it is not a runtime search loop. |
| Chess rules are external, honestly disclosed | **Pass.** `chess.js` supplies legal moves and terminal rules. Its legal generator temporarily makes/unmakes moves and verbose move objects compute notation; none of that notation/check/mate information enters the model score. Inspected dependency rules at `node_modules/chess.js/dist/esm/chess.js:2270-2355` and legality-filter locations around `:2484`. This is not a claim that all rule enforcement is encoded in the weights. |
| No training or pretrained policy | **Pass within inspectable artifact scope.** The deterministic compiler imports the generic parser/checksum and Node filesystem/crypto/URL utilities only. It consumes no dataset, optimizer, external policy or model download. Model metadata explicitly says authored, untrained and no search. This audit cannot prove the authoring LLM's historical training-data exposure; the evaluation notes acknowledge possible public-puzzle exposure. |
| Exactly two meaningful different sizes | **Pass.** Compiler accepts only Pocket/Atlas; manifest lists exactly two; browser and CLI expose those variants. Pocket has 55,865 neurons / 458,844 edges; Atlas has 828,757 / 3,546,297. Atlas adds substantive threat/shield/defense circuitry rather than padding (`tools/compile-models.mjs:115-224,287,318`). Reachability tests show every stored neuron contributes to an output. Larger is not claimed to imply stronger. |
| Size/parameter accounting | **Pass.** Complete binaries: Pocket 4,423,376 bytes; Atlas 38,397,700 bytes. Parameters include weights and all biases; topology bytes are separately disclosed and included in total bytes. The artifact test verifies the manifest accounting and exact bytes. |
| Honest authorship and strength claims | **Conditional.** Detailed mixed authorship and unestablished strength are explicit in README, architecture, manifest and binary metadata. F1 is the remaining contradictory attribution surface. No affirmative GM/Elo claim was found. A1/A2 must remain visible in acceptance reporting. |
| Browser interface | **Pass for inspected implementation and executed local cases.** Both colors, two models, explicit four-piece promotion dialog, legal castling/en-passant via chess.js, terminal reasons, new game/resign/flip, FEN import, PGN export, downloads/provenance, top-five logits and latency are present. Real unmocked built-site play worked for Pocket/White desktop and Atlas/Black mobile. Controlled browser contracts exercised promotions, reset/cancellation, keyboard access and export. Not every feature was independently exercised with real weights in this review. |
| Time controls and clocks | **Pass for reviewed conventions.** `public/index.html:34-35` exposes 1+0, 3+2, 5+0, 10+5, unlimited and custom. `src/clock.mjs:7-31` charges monotonic elapsed time, checks flag before increment, and prevents restarting a flagged clock. `public/app.mjs:196-212` starts clocks after load; `:224-247` charges AI inference and rejects late replies. Resets create a new board/game rather than preserving a position with replenished time. Tournament timeout-material adjudication is explicitly simplified, not advertised as full FIDE adjudication. |
| Worker/cancellation boundary | **Pass.** `public/worker.mjs:14-45` loads actual binaries and generic runtime. UI replaces/terminates old workers and correlates IDs; `public/app.mjs:118-122,166-193,224-239` rejects old instance/generation/position replies. Load versioning also prevents a superseded model replacing a later one. |
| Laptop interface | **Pass for Linux execution.** Extracted archive runs both real binaries through move CLI and UCI without `node_modules` in the extracted tree, npm install, GPU or service. UCI is intentionally minimal; it does not honor search budgets or offer searchmoves/pondering, and the README states these limits and GUI clock responsibility. F1 applies to its author identity. Other OS/device performance is not certified. |
| Reproducibility/build | **Pass for binary identity and runnable bundle contents.** The circuit tests compile both models in memory and compare saved bytes exactly. Independent isolated build preserves both hashes in browser distribution and extracted laptop ZIP. Build replaces the Node chess re-export with vendored ESM. Byte-identical ZIP timestamps/order or clean-machine dependency restoration were not independently certified. |

## Executed verification

### Existing suite

Executed from the project root under Node **v26.8.2**, npm **11.19.1**:

```sh
ASTRA_BROWSER_TESTS=1 \
ASTRA_CHROMIUM=/home/hermes/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell \
npm test
```

Actual result: **34 tests, 34 passed, 0 failed, 0 skipped**, duration 93,770.9165 ms. This includes in-memory recompilation and byte-for-byte checks against both saved binaries. Existing browser UI tests deliberately route a controlled worker/manifest; those tests alone are **not** real-weight E2E evidence.

### Independent actual-weight packaging and browser probe

Executed `python /home/hermes/.hermes/cache/scratch/astra-spec-probe.py`. It copied source/assets to an isolated scratch root, invoked the real `buildSite`, extracted the generated ZIP, ran both real models through the extracted CLI/UCI, and served the real built site to Chromium with **no model, manifest or worker interception**.

- Pocket CLI start position: `b1c3`; extracted UCI after `e2e4 e7e5`: `bestmove b1c3`.
- Atlas CLI start position: `b1c3`; extracted UCI after `e2e4 e7e5`: `bestmove g1f3`.
- Pocket browser, human White, 1280px viewport: `1. e4 Nc6`, returned to “Your move”, five candidate rows, 112.60 ms UI-reported inference latency, no page errors.
- Atlas browser, human Black, 390px viewport: `1. Nc3`, returned to “Your move”, five candidate rows, 267.10 ms UI-reported inference latency, no page errors.
- Both tested viewports had no horizontal document overflow. These timings are observations, not device-performance guarantees.
- Both browser and extracted laptop binaries matched the frozen hashes below.
- Probe receipt: `/home/hermes/.hermes/cache/scratch/astra-spec-hxjpstqs/receipt.json`. This is local supporting evidence, not a committed or publicly durable artifact.

## Reviewed SHA-256 receipt

These hashes bind the review to actual inspected files. The saved binaries also reproduce byte-for-byte from the reviewed compiler. The receipt intentionally excludes the held-out sample and evaluation results.

| File | SHA-256 |
|---|---|
| `PLAN.md` | `922639901b05c8dad98543002ff2c68897eeba9d106788e98ede4ad789179d97` |
| `README.md` | `bb9e8f42b71c20aefb7533427627ef2b99aac1106fc5083fbc8e063b60b1222b` |
| `package.json` | `7380bf69004d9d149722602fc0a73feef16f34ca6f4b1983f34ef90a7452921b` |
| `package-lock.json` | `90cf04009a4a5131c86af8acc0d0e68332f189023a8b202ddce2b1931c5cce87` |
| `docs/ARCHITECTURE.md` | `f93ad01f3460ca7808c994e6be8f6b5f4939835992a34feb62f7210521037e02` |
| `docs/EVALUATION.md` | `f42edb4e799a0d2322f257b4fee97a95221078c6711eb9804eaaa96d486a216d` |
| `public/index.html` | `17e9156ee9b8f7cc9e23dc97f5c7e1a5f971353bd09941332536a47117045f8f` |
| `public/app.mjs` | `192f94c97e467b1f19ff16af1938ac79eab96006f34cc31df8b2a1a98bf2b4af` |
| `public/worker.mjs` | `3d25905ad766295c42370f5ebc90ad2b7c754d6119216ee393bebab12649bcec` |
| `public/style.css` | `4dd0f3bb43bec77224d1bd0852dd754095834b9d1275d6d9370439bb9a3e9f8d` |
| `public/models/manifest.json` | `6d9d1c229da65167ca669afa77f64eb671ae38809d10da12e61b87b9f7189024` |
| `public/models/pocket.bin` | `77365eb86c5176255e06784592f9022a36ca6730c0dd3e4ce552cbf480762737` |
| `public/models/atlas.bin` | `45b639b0d0584b93aa472cef413c104b174d488ebc922d1c1b774c4b23cdcb85` |
| `src/chess.mjs` | `50e77eeb7df13b537f4d0e681852369c7ebb85e63915373fa5ef2d6359611859` |
| `src/clock.mjs` | `19355b93e1394a13d55c9a39d8d4a12c78093826b35edf862de7fc0c2128d6b0` |
| `src/network.mjs` | `f46d3a8fe19809c8780d69bc323707f3287de90582b66eba0ece30c4cbc5fd28` |
| `src/engine.mjs` | `5a381f2ca3b0c4a0d99115b6fef616ae8a6239cc3e802d27e7f26d0edbfe57b7` |
| `laptop/cli.mjs` | `c005c83fee3342a980bf24f93906053272bc74984bd9b63f0fb31efed4d455b4` |
| `laptop/protocol.mjs` | `81685b8d4eaea13f76556b3c76ff73bcc2a85960334be2bdf7497db02ea54ecf` |
| `tools/build.mjs` | `be28cc513c0ba2412e0edeb7016891c408b50e4993066b83067532d3bda218b5` |
| `tools/compile-models.mjs` | `84106e32cb3bdb39f01dcab43c746585ff217069c278c020fcf3ba1201305ece` |
| `tools/serve.mjs` | `f02aa80dc15e520e77e708e70d44dac2d1726123fc9659e5925bb6b9a1a1e83d` |
| `tools/benchmark.mjs` | `9f5eab6511e925b2537c4ad4295d508480f596d0c92ee55dfc23f683d5f9b6cb` |
| `tools/benchmark-lib.mjs` | `b239fd4f345b3202bf47dc6b42978105dfdd1ed7d9e78ac0c58338d356c7c6b1` |
| `tests/benchmark.test.mjs` | `76c7fdc48825f68228c65d78710983c669240de1ebc0e48f7978cd8c7fbb3cf1` |
| `tests/build.test.mjs` | `29cbf616872721be33439ea8e048ba7b405efb7e90a827e1e17e246ec145c871` |
| `tests/clock-ui.test.mjs` | `d3089368b5d5e07c78309816d6a7d8b2bac551d1cb95d9a8087c69cb70b9b520` |
| `tests/clock-worker.test.mjs` | `10fc86e8bc83b4195fce012b4813d4bf58f228b8fdb12be6a1ae01f3ac73e747` |
| `tests/clock.test.mjs` | `9f8a9fe25e026407d573e745ff236916f55f7eb5b9c377a5101e3a308adcfcf9` |
| `tests/engine-circuits.test.mjs` | `f1fb4bc939cd68da28fa4c97fd67f14d32d8ca6a7614df85577551e152569689` |
| `tests/engine-network.test.mjs` | `496341cae7f596a6bf3ae7f312a6a7588f20443a1d7d1ae0d4ab33080e295194` |
| `tests/engine.test.mjs` | `9c708ab30b403d2a65ac094227c41b45f6f6796a6b2481f1688033007c731446` |
| `tests/laptop.test.mjs` | `2459113981a9cc5de154e48c2885f172c9399df8e5df243f80d530f63d872df4` |
| `tests/server.test.mjs` | `97f5822181d55641da8707c87e710f79c41d8215d0fb7d534831db3e90ea59ff` |
| `node_modules/chess.js/dist/esm/chess.js` | `76c7c34f0e2e9ab076521a5d6fe786a9cce537bb1b6f29d32a9c9970b5b232d2` |

## Final-evidence addendum

After the initial review, the parent completed its benchmark and broader real-weight E2E and corrected the build to distribute `evaluation/`. The reviewer inspected the changed build/test source, `tools/browser-e2e.py`, `docs/RESULTS.md` and `evaluation/browser-local.json`, and parsed only aggregate/count fields from `evaluation/results.json`.

- The result has a completion timestamp. Both recorded binary hashes match the frozen artifacts, and all four recorded inference/harness source hashes match current files.
- There are 256 puzzle rows per model. Counting row flags reproduces Pocket 56 first moves / 27 full solutions and Atlas 112 / 74, matching the result summary and `docs/RESULTS.md`. There are 16 saved games per model; the reported two eight-game weak-baseline summaries match the document. The documented latency values match recorded observations. This validates aggregate consistency, not independent puzzle selection or winning-move adjudication.
- The browser receipt reports no page errors, exact real-worker/Node candidate parity for both models, actual play, promotion/PGN, castling, en passant, terminal FEN, real clock flag and mobile play. The script implements those checks without fake workers. This broader run was executed by the parent, not rerun by this reviewer; the reviewer's separate actual-weight smoke remains independently executed evidence above.
- `tools/build.mjs:27-34` now copies evaluation records into the site and laptop tree before making the ZIP, fixing relative report links. The reviewer ran `node --test tests/build.test.mjs` against that final delta: **1 passed, 0 failed, 0 skipped**. The original 34-test run and isolated extracted execution above preceded this packaging-only delta; they are not misrepresented as a fresh full-suite/extracted run on the final build hash.
- No model, compiler, app, worker, engine, clock or laptop implementation source changed. The only superseded hashes in the original receipt are `tools/build.mjs` and `tests/build.test.mjs`; the following final hashes replace those two entries. F1, A1 and the unfulfilled grandmaster scientific goal remain unchanged. Hosted deployment is still pending independent verification.

| Final/added evidence | SHA-256 |
|---|---|
| `tools/build.mjs` (supersedes initial hash) | `9a7f6a6d2e817f4c36f5329cfc4809d233246d0f2296f222b47aaf2158e91e02` |
| `tests/build.test.mjs` (supersedes initial hash) | `e8bca0fa7c0ae15886d5d4f608ee23c6b4c3a3c1c4de2e50b4315ac1a0ecd17c` |
| `tools/browser-e2e.py` | `4802a92852ec1c9922d2ca1b417c26305d728f47394ca9b77acd2b248d252229` |
| `evaluation/browser-local.json` | `4696a849331912ee63723b03b644aa32d80675bd9542cf09030026756dfaf607` |
| `docs/RESULTS.md` | `bf14edf7e6e13195a3890117370a62b966d775c9f5a1bc28796a0ed7b45c86f3` |
| `evaluation/results.json` | `0c242b2083f7379eaf563409d05cfa0a7911459a0db33df04115da8c2fd2adbe` |
