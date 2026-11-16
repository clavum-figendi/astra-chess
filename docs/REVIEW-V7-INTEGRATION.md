# V7 independent bounded integration review

**Verdict: conditional acceptance of the inspected UI/book and frozen selection; packaged CLI documentation/alias regression must be repaired before release. This is not deployment or model-promotion approval.**

Review snapshot: 2026-11-16 22:05–22:07 UTC; base commit `9bbf15bc2bd44d246b00227c7204c0a3e1a951f2`. Exact reviewed source hashes, isolated build output, CLI probes, prior UI binding checks and exposure-lock checks are in `REVIEW-V7-INTEGRATION.json`. No application, candidate, evaluator, historical result or shared build files were changed by this review. Temporary build copies were removed.

## Findings requiring action

### R1 — packaged CLI accepts removed IDs, and its shipped quick-start invokes absent models (release blocker)

`tools/build.mjs:19–28,48–49` correctly ships only `pocket-plus.bin` and `atlas.bin`. However `laptop/cli.mjs:19–24` accepts a hard-coded historical ID list and directly constructs `<id>.bin`, rather than resolving the active catalogue. `README.md:22–23`, which is copied unchanged into the laptop distribution, recommends `--model atlas-policy` and `--model pocket-policy`; neither file is shipped. The neutral `--model pocket` also fails although the shipped model is named Pocket.

An isolated real build succeeded, but executing its `laptop/cli.mjs --model pocket --fen '<initial FEN>' --seed audit` exited **1** with `ENOENT .../build/laptop/public/models/pocket.bin`. The same extracted-layout probe with no `--model` (default Atlas), and with `--model pocket-plus`, both exited **0** and returned book moves. Thus the present default works; this is not a default-startup failure. Historical IDs are still usable from the source tree, masking the packaging regression.

**Required:** make the shipped CLI resolve allowed files from its own manifest, provide deliberate family aliases if desired, and reject unavailable historical IDs cleanly. Update shipped README examples to active IDs/aliases. Test default, both active IDs, neutral family alias behavior, unavailable historical IDs and `--list-models` against an isolated packaged tree; do not restore extra old binaries just to satisfy stale examples.

### R2 — laptop omits the book's root provenance notice (small packaging-contract gap)

`tools/build.mjs:50–54` copies the book and the full documentation but not `public/OPENING-BOOK-NOTICE.txt`. The isolated ZIP contains the **verbatim complete CC0 text** at `docs/OPENING-BOOK-COPYING.txt`; this is not evidence of a missing CC0 permission or an attribution violation. Nevertheless `docs/OPENING-BOOK-V7.md:26–31` explicitly instructs shipping the root notice together with the book. Copy it to the laptop root, or explicitly revise that distribution contract to reference the notice already shipped under `docs/`.

## Checks passed and their limits

### UI and book

- Ran `node --test tests/v7-ui-premove.test.mjs tests/v7-ui-surface.test.mjs tests/build.test.mjs`: **5 passed**, zero failures. Premoves are consumed once and legally rechecked; terminal/stale/flagged queues are rejected; sound defaults silent, persists explicit preference and stops active voices; the technical disclosure starts closed.
- All seven source hashes in `.cache/v7-ui-evidence/receipt.json` still match the inspected UI/clock/runner. Its existing browser receipt reports no page errors and `sourceDrift: false`. This review did **not** use the browser or re-certify its old nine-model preview as the final three-model build.
- Rebuilt the expanded book **in memory**, without changing its artifact. Every byte matched `public/openings.json`: SHA-256 `dc6398f617d58dc5e7697eea46452a465326cac808bc60f34d2439f5deef5d3d`, 1,013,432 bytes, 5,575 positions and 8,190 continuations. The compiler still strictly validates SAN beyond its 32-ply selection cutoff.
- Checked all seven vendored source/license files against the independent pinned-source receipt: every local hash matched. Existing independent book review records 10 passing corpus/CLI/UCI tests, including strict per-line equivalence and all 500 ECO codes. I did not repeat its network fetch or full suite. Weighting remains path votes, not game popularity, and 465 terminal ECO labels are not misrepresented as 500 terminal labels.
- An isolated build using the actual current sources produced exactly three site choices: `pocket-plus` → Pocket, `atlas` → Atlas, and `deepmind-9m` → DeepMind 9M. Only the descriptor-selected FP16 ONNX was copied. Laptop manifest/binaries contained exactly the two active sparse models, no ONNX. Website and laptop copied the complete CC0 legal text unchanged; the generated laptop ZIP's legal-text member was checked directly.
- Browser initial HTML still says `pocket`, absent from the final manifest, but `loadManifest()` replaces the options and naturally leaves its first active option selected when the old ID cannot be restored (`public/app.mjs:351–372`). This is not the CLI's direct-filename alias failure. Final browser verification must nevertheless exercise startup before/after manifest loading with the reduced catalogue.

### Weight attempts, data separation and temporal gates

- Read the bounded protocol, generation, candidate, selection and evaluator code. Proposals use old development splits, not the new final-test labels. New validation/final data are whole-family separated; this review independently counted **96 validation / 93 test**, eight groups each, zero duplicate board/side IDs within either split, zero cross-split overlap and zero overlap with all v0.3/v0.4/v0.5 train/validation/test board+side identities.
- All fresh split hashes, protocol hash, generation-source hashes, four frozen report hashes, selected sparse file hashes and selected checkpoint hash match their recorded bindings. The selected winners are Pocket+ and Atlas; the new sparse coarse candidates were attempted, not silently substituted after poor fresh-validation generalization.
- `selection.json` is byte-identical in cache and evaluation. It records freeze **21:53:24 UTC**; the exposure lock records **21:56:03.576113 UTC** and binds selection SHA-256 `2b12a3175a39a7abfddf2d2b2f3a79daadce2b41db5e0001fa14b3ca1fb16015`. Its evaluator hash matches the current untouched evaluator. Generation/proposal/selection scripts refuse execution after selection/exposure. No code path for retrying a different candidate after fresh-test exposure was found.
- This is an operational freeze backed by local artifacts, not an immutable external preregistration or proof that nobody manually read the plaintext test file. The prose protocol does not independently timestamp every implementation detail; do not overstate the assurance.
- Ran `.cache/learning-venv/bin/python -m unittest discover -s tests -p test_v7_head_candidates.py`: **1 passed**. The initial generic `python` attempt failed because that interpreter lacks Torch; using the existing project learning environment fixed the test invocation, without installing anything.
- Loaded both actual DeepMind checkpoints and compared tensors: **only** `head.weight` (32,768 scalars) and `head.bias` (128 scalars) differ. Candidate weight equals original head weight × **0.95** exactly; candidate bias equals original bias × **0.95**, then bucket 63 minus **0.05**, exactly. Every encoder tensor is bitwise unchanged. This is a genuine head-only weight edit, not encoder training or an asserted discovery of neuronal semantics.
- Fresh validation selection caches bind raw FEN, ordered legal actions, base checkpoint, model/encoding source and batch size. Final evaluation recomputes frozen-encoder features from raw final positions rather than trusting those validation/development caches. Old v5 proposal-fit caches are identity/legal-list checked but were not independently recomputed by this bounded review; that limits claims about old-cache integrity, not the newly recomputed final boundary.
- Snapshot at 22:04 UTC: both DeepMind variants have **55/93** bestmove hits and **82/93** top-four hits; Pocket+ **24/93**, Atlas **28/93**. The running match file then had **13 games and no final summary**. These observations do not establish a strength improvement and must not be used to reselect candidates. Lower policy CE on validation is not an Elo or match-strength claim.

## Code-quality notes and remaining release gates

`git diff --check` passed. No new secret, shell-injection, dynamic-code execution or external data transmission issue was identified in the inspected changes. Local build metadata are repository-controlled, not a hostile input boundary; stronger schema/path validation would improve robustness but is not the reproduced blocker above.

The evaluator source itself is exposure-hash-bound, but imports/runtime dependencies are not all transitively bound by that lock. Final release evidence should also hash the encoding/model/runtime modules and Stockfish binary/configuration used, and validate PGNs and stored decisions. The present final loop records book disablement, legal moves, true terminal draws and unresolved ply caps separately; do not combine caps with genuine draws.

Still owned by the release agent: repair R1 (and reconcile R2), finish and validate paired games without test-driven reselection, decide promotion against the predeclared nonregression gate, conditionally re-export and verify changed DeepMind browser/ONNX fidelity, rebuild/retest the final reduced catalogue and downloads, final actual-browser integrated book/UI checks, and live deployment smoke tests. This review neither waits for the running games nor approves an export, remote publication, globally strongest-model claim, or final deployed state.

## Short delta review — 2026-11-16 22:34 UTC

**Updated scoped verdict: R1 and R2 are resolved in the inspected source and current packaged laptop tree. No remaining blocker in this packaging/alias delta.** The earlier sections and JSON receipt remain historical snapshots, not hashes of this revised release.

- Inspected `laptop/model-selection.mjs` and its CLI integration: manifest exact ID takes priority; `pocket`/`atlas` family fallback requires exactly one matching suffixed model; unavailable IDs produce a controlled `Unknown model` error; filenames are manifest-derived and constrained to simple `.bin` names, with no historical filename fallback.
- Ran `node --test tests/model-selection.test.mjs tests/build.test.mjs`: **2 passed**, zero failures. Also independently exercised ambiguous-family rejection. Against the actual `build/laptop` tree, default, `pocket`, `pocket-plus`, and `atlas` each exited **0** with a legal initial-position book move; `pocket-policy` and `atlas-policy` each exited **1** with only the controlled Unknown-model message. `--list-models` exposed exactly `pocket-plus` and `atlas`. CLI, resolver and README bytes match their packaged copies. README examples now use `atlas` and `pocket-plus`.
- `tools/build.mjs` now copies the root opening notice. Actual packaged `OPENING-BOOK-NOTICE.txt` and `DEEPMIND-CODE-LICENSE.txt` match their public source bytes, and packaged complete CC0 text matches the vendored original. This closes R2; a subsequently regenerated delivery ZIP remains the release owner's verification boundary.
- Read completed results: **16 games**; DeepMind v6/v7 each **3 wins, 1 draw, 0 losses**, with both still **55/93** final-test hits. The parent verification receipt binds the current result and frozen selection hashes and records 189 fresh identities, 16 replayed games, 569 decisions and the previously independently checked 32,896 head-only changes. No new inference or independent PGN replay was run in this short delta review. These results support no observed regression in this bounded comparison, not demonstrated increased playing strength.
- The selected public ONNX hash is `b2a643b1bb910e0035e514ef7efecc62b69dbd3740af6cc18abaddf75471d8ee`, matching browser-transformer metadata. The actual-browser receipt records **12/12** reference agreements and no page errors. Its app/worker/transformer/resource source bindings still match. The current site manifest exposes exactly Pocket, Atlas and DeepMind.
- **Source-binding qualification:** `browser-transformer.json` still binds the *earlier* builder hash, not the alias/legal-copy builder now inspected. `ui-final/receipt.json` matches the current app/CSS/premove/sound/clock/runner and current built model manifest, but its HTML hash differs. Compared current HTML with the exact hash-matching retained preview: the only deltas are two documentation links inside the collapsed technical panel and the v0.7 laptop-download URL/text. These are reviewed documentation/link deltas, not a fresh browser run of the exact final HTML. Do not label the earlier receipt as byte-identical final-release coverage; validate those links/downloads in the final live smoke test.

Delta source SHA-256 bindings:

| File | SHA-256 |
| --- | --- |
| `laptop/cli.mjs` | `c1bf4e2f565ef1f335bee3c2844e02b31b1a00660bd67d2714249241772fca15` |
| `laptop/model-selection.mjs` | `d760c9448e9883261e694f2aabe9aa9b02c18791301d63928badb0754a80c9c3` |
| `tools/build.mjs` | `e859436b030793a8b49e5911acd31596016cfab8a501473c1f05a0b6f96f7f00` |
| `tests/model-selection.test.mjs` | `ce7e052ec0a45b896260acc43e854add9d0273d9385f6b967b6ec7a9b271989e` |
| `README.md` | `163f29c395ca9f04ef44ae1af6a6fa7b68bfa3664f0584cea752f680a59d5e7f` |
| `public/index.html` | `60487dc3ed447fb7ca82681f6476d4497c9fc96eb9c95a973145b113d367e57e` |

Only this review document was modified in the delta pass. Final release documentation, regenerated ZIP inspection, remote publication and live checks remain outside this approval.
