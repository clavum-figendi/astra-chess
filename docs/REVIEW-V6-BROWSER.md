# Independent review: browser DeepMind 9M integration

## Verdict

- **Core implementation/spec: PASS within the bounded inspection and executed Node coverage.** The corrected adapter matches all 1,968 Python action IDs and the three shipped Python FEN-token fixtures; selected weights and the frozen PyTorch reference match their declared hashes. No new blocking history, async-result, time-charging, or ORT asset-resolution defect was found in the inspected path.
- **Release completeness / quality: NOT YET PASS.** Resolve the publication/documentation issues below and obtain the parent's final source-bound browser/held-out receipt. This is not approval of a deployed site, full browser compatibility, playing strength, or an uninspected later revision.

Review base: `c5302175076fba107b9a076253dd5e2274f5a34e`. The working tree contains substantial uncommitted/untracked work; review is bound to file digests below, not merely that base commit. Only this review document was written by this reviewer. No browser, heavy inference, weights, remote state, or production build tree was modified.

## Findings requiring attention before publication

1. **Distribution licensing/attribution package is incomplete in the inspected build inputs.** `README.md:57` assigns the transformer code Apache-2.0 and weights CC-BY-4.0, while `tools/build.mjs:28–30` ships docs plus the project MIT license. `public/vendor/ort/` supplies ORT notices, but no dedicated DeepMind attribution/change notice, Apache-2.0 license text for the newly Apache-marked code, or direct CC-BY-4.0 license link/text was found in the shipped public/docs inputs. Existing research docs identify Google DeepMind, its upstream README and weight license, but do not provide a clear distribution-specific modification/provenance notice for this selected artifact. Upstream adaptation metadata under `spikes/` is not copied by this build. Before distribution, include an accessible third-party notice with Google DeepMind attribution, upstream/source and license links, selected-artifact identity and description of adaptation/FP16 changes; include applicable code license text and retained notices. This is a release-completeness concern, not a legal opinion.
2. **New user-facing results link currently has no target.** `public/index.html:21` and `README.md:9` link `docs/BROWSER-V6.md`; that file did not exist during inspection. Parent may be drafting it concurrently. Ensure the final build contains the file and that its claims are scoped to the correct evidence.

## Other quality findings (non-blocking implementation issues)

- `spikes/browser-9m/transformer.test.mjs:36` retains the obsolete broken-order expectation `a1a8 -> 6`; running it fails with actual `19`. The new full Python fixture contract passes and takes precedence. Correct or explicitly mark the obsolete spike test historical; do not claim every extant test passes. This spike suite is outside the default `tests/*.test.mjs` command.
- `README.md:13` says every post-book move uses one sparse forward pass, and `public/index.html:46` similarly says one forward pass. That is false for the DeepMind policy, which scores legal actions in batches of four (`src/transformer.mjs:66–76`). Update those general statements to distinguish the sparse policies from per-legal-action transformer evaluation. No local grandmaster/Elo claim was found.
- Descriptor `measurement.pythonInferenceSeconds` is `249.39073627299513`, whereas the selected FP16 variant in `evaluation/v0.6/python-onnx-evaluation.json:45` records `240.2947758359951`. Label the measurement's separate origin or align it with its cited receipt; do not present them as the same run.
- The UI has a fixed 30-second inference timeout even for Unlimited (`public/app.mjs:193–198`). It terminates the worker through the error/finish path, so late results cannot enter the board. This is a slow-device usability limit, not a clock bypass; document it or adapt it if wider slow-device support is required.
- The descriptor selection-policy path points into `spikes/`, which this build does not ship. It is provenance metadata, not an active resource fetch, so this does not block play; provide a working source-repository link if exposed to readers.

## Spec evidence

- Independently hashed `.cache/deepmind-v5/adapted.pt`: `05a434c6925312fc02323c3015d187d78016cef6ecc6485bbc9da0fcc4d3d264`.
- Independently hashed selected `public/models/deepmind-9m-fp16.onnx`: `4faa374e93c82e92f4f443cf36d9d2fdc98e22d69991cdc6d0d6a3ecdbe3957e`.
- Python evaluation receipt contains 207 reference rows, reports FP16 207/207 top-move agreement and 126 teacher hits (zero teacher-hit loss). INT8 reports 104/207 agreement and 82 teacher hits, losing 44, and is rejected. This reviewer checked the receipt and hashes, not a fresh Python inference run. The earlier JAX/Haiku parity execution is supplied prior evidence, not independently rerun here.
- Browser adapter preserves FEN/action encoding, deterministic UCI tie-breaks and bucket expected-return ranking. History replay reconstructs the requested normalized FEN, retains chess.js history, and checks both current threefold and one legal reply for a claimable repetition before assigning 0.5 to a candidate. Imported FEN cannot recover pre-import history; UI documents this.
- Worker verifies bytes/SHA before loading, awaits asynchronous ranking, and checks load-version supersession before returning a move. UI additionally rejects replies after generation/FEN changes and terminates the worker on reset/finish/settings changes. No mutable-after-await result defect was identified in this UI path. Concurrent arbitrary non-UI worker clients are not separately validated.
- ORT import and WASM paths resolve from `dist/src/transformer.mjs` to `dist/vendor/ort/`; all named runtime assets exist in public inputs. `numThreads = 1` is explicitly set. Manifest merge supplies architecture/config plus the model entry's string `runtime: 'onnx'`; the descriptor's outer runtime object is retained separately as `runtimeOptions`.
- Build fixture verifies standalone chess.js replacement, ONNX browser-manifest inclusion, and ONNX exclusion from the sparse-only laptop bundle. It does not exercise real browser inference.
- Clock inspection shows loading is untimed; thinking time is charged and increment is only granted before flag fall. Late inference checks the clock again before applying a move. The stated automatic threefold/fifty-move and timeout-material conventions are explicit product conventions, not a claim of complete FIDE claim handling.

## Executed checks and limitations

1. `node --test tests/transformer-contract.test.mjs tests/model-resource.test.mjs` — **4 passed**, including exact 1,968-action equality and artifact path/integrity rejection checks.
2. `node --test tests/build.test.mjs spikes/browser-9m/transformer.test.mjs` — **5 passed, 1 failed**; failure is the obsolete spike action ID above. The build test uses a disposable fixture directory, not the parent's live dist tree.
3. `node --test tests/clock-worker.test.mjs tests/clock-ui.test.mjs tests/clock.test.mjs tests/book-ui.test.mjs` — **6 passed, 6 skipped**. Browser-dependent cases were skipped and must not be counted as browser coverage.

`evaluation/v0.6/browser-smoke.json` was read as parent-generated evidence: three held-out browser choices agree with its reference, book returns e2e4, no recorded page errors, actual ORT runtime asset requests. Its transformer/worker/resource hashes match the reviewed versions, but its app/build hashes differ from the inspected snapshot. The parent must account for those deltas and bind final evidence to final code. The old `browser-probe.json` belongs to the broken-order adapter and is historical only, never fidelity evidence.

The planned 32-position browser and 147-position Python held-out runs were not present as final evidence at this snapshot. Do not extrapolate the 207-position validation result or three-position smoke into universal numerical parity, strength retention in matches, speed on all devices, cross-browser coverage, or final publication. No full suite, security scanner, browser launch, paid resource, or expanded experiment was run by this reviewer.

## Reviewed SHA-256 bindings

| File | SHA-256 |
|---|---|
| `src/transformer.mjs` | `dc7ee006e1eb6448d186ea645ca40cf21f51f9db558366b8483e587a1ff1c0ab` |
| `src/model-resource.mjs` | `1da6611174aceb2322ee8b534f0969bbd43a7c770163fd5bd1370f99f801d417` |
| `public/worker.mjs` | `8da5554a89d2e50e4787f8874e03e4cb5fa29bfedfcc6c69bd5238e029e16819` |
| `public/app.mjs` | `2877388aabb19c89132017d39e41af678a517cee7dd3065d2db0dc775a88b74d` |
| `tools/build.mjs` | `68119aa1d5a7428e8b3ccbf14e2ae0313a0a5fc790ab11a17a9a0327ad4c2587` |
| `public/models/deepmind-browser.json` | `434dbac36c8a0ab245761c37c9d0a5f1dae36e790a568a74268ba613bdcbd52c` |
| `evaluation/v0.6/python-onnx-evaluation.json` | `861e4d8c82af6e36ad27eb6512008ac050a9d75f1e4f7dea5c325a439ede479f` |
| `tests/transformer-contract.test.mjs` | `322fa1e06228dbdaa51782743ca24fe8edf7b38b71244e7d22451108900d962c` |
| `tests/fixtures/deepmind-token-contract.json` | `446f0bbb16d522615df703ad6876ba2de148463f3f82ab3eeed1548c6c7a7b7d` |

Later deltas require proportionate reinspection/retesting; this document does not silently approve them.

## Follow-up: bounded publication-condition delta review

**Updated verdict: bounded spec PASS; bounded pre-publication quality PASS. The two publication conditions identified above are resolved in the inspected browser-distribution inputs.** The earlier findings and evidence are preserved as historical review state. No blocking implementation issue remains identified by this review. This is not a claim that publication, the pending release asset, hosted verification, universal browser compatibility, or game-strength evaluation has completed.

### Resolution verified

- `docs/BROWSER-V6.md` now exists and identifies Google DeepMind, the immutable upstream revision/checkpoint, CC-BY-4.0 with its license link, the complete selected-artifact SHA-256, and conversion/head-adaptation/ONNX/FP16 modifications. It distinguishes measured choice parity from universal fidelity or Elo, and storage savings from activation/runtime-memory savings. This resolves the missing user-facing results target and the distribution-specific attribution concern for the browser package.
- `public/DEEPMIND-CODE-LICENSE.txt` contains the full Apache-2.0 text. ORT's license and third-party notices remain present. The reviewed build copies public files and docs into the browser tree, so these materials enter that distribution. This is a technical completeness check, not independent legal clearance for all upstream rights or the separately assembled laptop release.
- README and index now distinguish sparse single-pass policies from legal-action transformer batching. Index documents the 30-second inference safety timeout, including Unlimited. No executable script addition was found in the inspected index: its module script still loads `./app.mjs`.
- Descriptor Python timing now equals the selected receipt's `240.2947758359951` seconds. The obsolete spike expectation now uses `a1a8 -> 19` and passes.
- Main app, worker, transformer and resource hashes are unchanged from the original review. Build hash is also **unchanged** (`68119aa1…4c2587`); the selected-only ONNX copy filter at build line 15 was already present in the initial review, not a new unreviewed delta. The full contract test now also includes the parent's history regression; it passes.

### Additional receipt review (read and aggregated, not rerun)

- `browser-integrated.json`: programmatically counted 32 rows, 32 reference agreements and 15 teacher matches; no recorded page errors. Receipt median is `5247.39999999851` ms and maximum `7792.399999991059` ms. Every recorded app/worker/transformer/resource/build source hash matches the inspected files.
- `heldout-onnx.json`: programmatically counted 147 answers and 85 teacher matches. It records 147 reference agreements, unchanged selection and the selected ONNX digest. Reference agreement is a receipt assertion, not independently recomputed against a fresh PyTorch inference by this reviewer.
- `browser-legacy.json`: inspected real-browser receipt enumerates nine exposed models and parity checks for eight legacy models, plus book/UI, castling, en passant, promotion/PGN, clock and mobile checks, with no recorded page errors. Its index hash precedes the presentation/documentation delta; do not relabel it as an exact final-index run.
- `browser-delta.json`: programmatically counted three rows and three reference agreements; records cancellation during actual inference, no page errors and sampled browser RSS. Every recorded core source hash matches the inspected files. Summed Chrome RSS includes shared pages and is not exclusive model RAM or a universal peak bound.
- Parent reports the broader 88-test run as 82 passing and six browser skips. This follow-up did not rerun that full command or transform those skips into browser passes.

Executed cheap follow-up command:

`node --test tests/transformer-contract.test.mjs tests/model-resource.test.mjs tests/build.test.mjs spikes/browser-9m/transformer.test.mjs`

**11 passed, zero failed, zero skipped**, including full action IDs, FEN tokens, history mismatch/repetition regression, selected-runtime resource integrity and isolated build fixture. No browser or heavy inference was launched; no live dist rebuild or remote write was performed by this reviewer.

### Limited-delta SHA-256 bindings

| File | SHA-256 |
|---|---|
| `public/models/deepmind-browser.json` | `605199c0616ca1fba87a803a09088fb26e2a1e8cb5f00cead955a6387c9d39e7` |
| `public/index.html` | `811707f1c55351f39b9b6a1d4d5102f7c71239eec371f38ba5fc8f953b7dae62` |
| `README.md` | `5fd474e6c186511a2ad243564e70e530a127bdbf17a81394aa046505df8f8d8b` |
| `docs/BROWSER-V6.md` | `47fae96c8bf1fca9e424ea5e63e8fe0ce17444c25dadd283a963b1d7eaf62041` |
| `public/DEEPMIND-CODE-LICENSE.txt` | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `spikes/browser-9m/transformer.test.mjs` | `7137922ee122b4e1ac2b381e0239e28e3985565e99758e81562daf379aa1fafc` |
| `tests/transformer-contract.test.mjs` | `f6e24a43fa780d688aec447ece85dee93536432b31bbba4cd4f4e33417ff6c25` |
| `evaluation/v0.6/browser-integrated.json` | `78530c36f035e3ee019698ca55db7b46d44bc477d05d60e8829bd02857b0c613` |
| `evaluation/v0.6/heldout-onnx.json` | `943b70dba64f177c00bc1d0dc7cb32cf43ea62e81ada05dccd3888220046f090` |
| `evaluation/v0.6/browser-legacy.json` | `99713f6b61bb142d574e8274bdd0f730d4eee5c9845a16f49665dd6c5c9ab07c` |
| `evaluation/v0.6/browser-delta.json` | `6584c85a06b24819c1005a441b7f6ac660bc4e5caa7f49b6b48271e7f9cdbab2` |

Parent retains responsibility for final artifact/source bindings, the planned final browser smoke, creating and checking the linked `v0.6.0/chess-lab-9m-laptop.zip` release asset before making that link public, Pages publication and hosted read-back verification. The release link is pending, not verified working here. The provenance-only `spikes/` selection-policy path remains a non-blocking source-reference limitation. Any subsequent executable delta requires proportionate new review; later documentation-only changes must retain accurate evidence scope.
