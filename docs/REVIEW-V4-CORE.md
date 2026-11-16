# V4 core independent review

## Verdict and scope

**PASS for the bounded opening-book integration and direct-policy core. No release-blocking defect found in this scope.** This is not approval of the unfinished v0.4 training/evaluation pipeline or a claim that a fitted model plays better.

Reviewed against base commit `366dcee655c77de5a6d70492e8ee967dfdb7d452`, spec first, then implementation quality. Source and tests were read independently and exercised without editing program inputs. The only repository file created by this reviewer is this report. No commits, deployment, paid/cloud jobs, root build, historical benchmark rerun, or model fitting was performed. Temporary isolated build/probe trees were removed automatically.

Excluded explicitly: `tools/fit-policy-models.mjs`, unfinished evaluation orchestration, all fresh v4 labels/results, test-label files, final-test gating, split provenance verification, model-cache/final-test locks, fitted v4 artifacts, package-version/docs changes and final release packaging. The existing optimizer smoke test uses only two v3 **train** and two v3 **validation** rows as plumbing fixtures; it provides no v4 policy evidence and did not read test labels. Historical branding/metadata is not treated as a current gameplay defect.

## 1. Spec compliance

- **Direct policy target:** `tools/policy-optimizer.mjs:32–46` forms a 75% actual-bestmove hard target plus 25% normalized `exp(-(rank-1))` rank target and optimizes stable softmax cross-entropy. Centipawns are not gradient targets or checkpoint criteria; they feed an auxiliary mean-selected-CP metric. Contrary-CP and sign-flip tests pass.
- **Teacher integrity:** `tools/policy-labels.mjs` delegates complete legal-root coverage/exact-depth/non-bound checks to `completeLabels`, enforces unique ranks in `[1, legalCount]`, requires PV root/move agreement and rank-1/actual-bestmove agreement. Unit inputs are synthetic and were not mistaken for new engine evidence.
- **Increased capacity:** actual base binaries produce 1,031 free groups for Pocket Plus and 1,965 for Atlas Plus (1,038 / 1,972 total). This unties existing terminal edge multipliers by geometry, destination band and promotion; it does not increase network node/edge counts. Protected and internally consumed nodes remain unchanged, with canonical representatives for shared heads.
- **Pure selector remains pure:** `src/engine.mjs` is unchanged against HEAD. Book lookup is external in worker/CLI; explicit book-off paths preserve the neural selector. No inference-time Stockfish, search or fallback engine was added by these changes.
- **Varied openings:** all 42 curated lines compile legally into 340 exact position keys. The compiler executes every SAN move, including moves after a shorter configured selection cutoff. Eligibility checks include side, castling, exact EP field and absolute ply/maxPlies. Legal-candidate filtering and terminal guards precede selection.
- **FEN/history integration:** browser and UCI preserve imported raw FEN until its first move, preventing normalized non-capturable EP from manufacturing a book hit. Browser/UCI keep history-sensitive terminal checks; repetition never asks the book/policy to move. Late-fullmove lookalikes and castling-right mismatches miss the book.
- **Randomness and traceability:** seeds reproduce weighted selection; normal browser new games generate fresh cryptographic seeds. PGN preserves Seed/Book, UCI/CLI report seed/book/source, and book weights are displayed separately from policy scores. A 64-seed initial-position probe produced `{d2d4:20,e2e4:40,b2b3:2,c2c4:2}`; variety is observed, not guaranteed for every pair of games.
- **Neutral gameplay UI:** current browser title/body, opponent labels, UCI identity and PGN naming are neutral. Gameplay errors no longer append repeated fallback disclaimers. Existing historical model records were left intact.
- **Packaging:** book JSON is copied to laptop root; runtime imports close over shipped `src/`. A build from an isolated staging tree using current source/assets was extracted and run without node_modules. Actual packaged browser workers under `/chess/` exactly matched extracted Node CLI move/source/seed/book/candidates in 16 cases across both Plus models, book on/off, start position, black after e4, late-fullmove and imported EP mismatch. Timings were intentionally excluded from equality.

## 2. Quality findings

### Blocking findings

None identified for the scoped core and current curated artifact.

### Non-blocking hardening: validate full move coverage at the production feature/label join

**Location:** `tools/policy-optimizer.mjs:5–29` (and the future orchestration caller).

The public optimizer deliberately accepts legal subsets: the existing two-candidate synthetic unit fixture at the starting position is accepted, despite 20 legal moves. It checks legal membership and rank uniqueness/range, not `moves.size === legal.size` or contiguous ranks over a complete set. This is not a demonstrated bad current label: `policyLabels()` does enforce complete legal roots upstream. However, a feature/label join that drops rows after that check would still fit a silently truncated softmax.

**Action:** the production caller should assert equality of full legal, label and feature move sets immediately before fitting/caching; alternatively add a strict production validation mode while retaining intentionally partial unit fixtures. Add a dropped-move negative test at that boundary. Do not rely only on equal array lengths.

### Non-blocking consistency: CLI validates less book structure than the worker

**Location:** `laptop/cli.mjs:30–31` versus `public/worker.mjs:36–38`.

The worker recompiles curated lines and discards the serialized position map; CLI consumes that map directly. The shipped artifact exactly matches recompilation and passed packaged parity, so this is not a current behavior mismatch. A locally edited/stale JSON map can nevertheless diverge between clients even while returning legal moves. Consider recompiling once in CLI too, or validating the artifact at build time and documenting it as immutable.

### Bounded security/readability assessment

No secret, dynamic-evaluation, shell-injection or unsafe-deserialization finding in the 10-file changed/new-source scan. Runtime book candidates are legal-filtered, UI candidate/name text uses textContent, and worker asset resolution stays relative under a URL prefix. The small fitting modules have explicit bounds, finite-value checks, deterministic grouping and validation-only checkpoint selection. No refactor is required for this core review. Final shipping still needs source-bound release verification once models, orchestration, versions and documents are finalized.

## 3. Executed checks and results

### Focused Node suites — 18 passed, no skips

```sh
node --test --test-concurrency=1 tests/opening-book.test.mjs tests/book-cli.test.mjs tests/policy-labels.test.mjs tests/policy-optimizer.test.mjs tests/policy-tuning.test.mjs tests/laptop.test.mjs tests/build.test.mjs
```

This includes float32 serialized-score/feature checks for both models, both colors and promotions; shared-head/protected-topology checks; optimizer bounds/finite/leakage checks; checkpoint eligibility and patience; book legality/draw/key/cutoff checks; CLI/UCI history behavior; and isolated synthetic build closure.

### Actual browser opening integration — 1 passed

```sh
ASTRA_BROWSER_TESTS=1 node --test --test-concurrency=1 tests/book-ui.test.mjs
```

This test passed during a combined invocation with the remaining browser tests. It auto-discovered installed Chromium 1208 and exercised the actual binary-backed worker, prefix URL, fresh seeds, PGN, source/weight display, book-off fallback, imported EP/fullmove boundaries, checkmate and mobile width.

### Existing UI/worker regression checks — 7 passed, no skips

```sh
ASTRA_BROWSER_TESTS=1 ASTRA_CHROMIUM=/home/hermes/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell node --test --test-concurrency=1 tests/clock-ui.test.mjs tests/tuned-ui.test.mjs tests/clock-worker.test.mjs
```

Initial environment-only attempt: the five clock-UI tests failed before browser creation because this installed Playwright expected absent Chromium 1248. Rerun with the existing Chromium 1208 executable passed all seven tests. No browser download or source workaround was used.

**Successful unique test total: 26.** Separately, the isolated packaged worker/Node parity probe completed all 16 cases; its real output was:

```json
{"extracted_laptop_no_dependencies": true, "packaged_book_bytes_match": true, "actual_packaged_worker_node_exact_parity_cases": 16, "models": ["pocket-plus", "atlas-plus"], "prefix": "/chess/", "book_on_off": true, "fields": ["move", "source", "seed", "book", "candidates"]}
```

Additional executable probes verified 42 branches/340 positions, 64-seed variety, and actual free-group counts. Scoped SHA-256 values were collected after inspection/tests and rechecked unchanged after the packaged probe. Full benchmark history and fresh-label training/evaluation were intentionally not run.

## 4. Scoped SHA-256 binding

These hashes bind this review only to the following files, not to the mutable whole working tree. Re-review changed executable inputs before treating this as release evidence. Model hashes below are the existing runtime/base fixtures actually exercised, not future policy-model approval.

**Concurrent version-only delta caught at final check:** after the packaged parity probe, the parent changed the generated laptop package metadata in `tools/build.mjs` from `astra-chess-laptop` / `0.3.0` to `chess-lab-laptop` / `0.4.0`. Its new SHA-256 is `a7d8fdccc783573be2f8ecd8e8830c89e67186bb9ecaf3d0b5d121428c6e1934`. I inspected that exact delta and reran `node --test tests/build.test.mjs` (1 pass). All other hashes below still matched at final comparison. The 16-case packaged parity receipt remains bound to the earlier build-script hash printed below; it is not relabeled as a new final-release package test.

```text
7eb2996afaf9da450681937e4ebe8af0c4643dce9a44e1a83cc8ba3bac5d238d  src/opening-book.mjs
5a381f2ca3b0c4a0d99115b6fef616ae8a6239cc3e802d27e7f26d0edbfe57b7  src/engine.mjs
f46d3a8fe19809c8780d69bc323707f3287de90582b66eba0ece30c4cbc5fd28  src/network.mjs
50e77eeb7df13b537f4d0e681852369c7ebb85e63915373fa5ef2d6359611859  src/chess.mjs
2b83dffe8667ca9a0b0b04b179935a2cd24b5a7484d5717a7c9cd8bb2c668a19  tools/build-opening-book.mjs
eda61fb60b4baff9b7831259fdd52c291343598c73d13a6d3501e804283e64b1  public/openings.json
ec384401488314101fca81669f0f90623790a8dc5b302a7d82c58bc30ffe13bb  public/app.mjs
42cc09e92db77460a9135e9c3a96f3869eab118bba0defd2c56d5a7d55ed7c00  public/worker.mjs
b2cacab8d8316f624ea452d276d38269f670b121a99ca08684ec64d9d967e853  public/index.html
e7ddf51222919e23c2a92fb2de796c108c8e6250c500d8552c564bc0334080bf  public/style.css
97112725361aa5d47d7d0d83c2fd72cac4a51806c776b942c7041a9978636e40  laptop/cli.mjs
443af851b0a85610c42dfd7e7e6ead6abfe5e448d7cc95326ff62cdca9d08c3f  laptop/protocol.mjs
5df71b5ef6838d54fb903a819751064dd0131bd2fa55d16ad0033f26ec3ee875  tools/build.mjs
a6cac7e246fdbac52a7ca14e25de960e4d1d0db6a943956deb99802eeb8bb19d  tools/policy-tuning.mjs
8012f5f3c7a74937596bd5f77ec9b09136cae3542b89b768f55f18a1dfe29438  tools/policy-optimizer.mjs
7923eebc0b55e786b3a4acd2e442b3c6f7794b1085d131e4815dde6bd02d89ec  tools/policy-labels.mjs
cd29b6a81235e619b8ddb2b3e42f189a9047e5f8b6720d324d243e7beb11b3a4  tools/weight-tuning.mjs
edb91e9611b2210b538e181e0e291b57f06db9852a2d06970605f5fa929c9ad0  tools/engine-labels.mjs
25ed11adf43642bd22b5ed5ee68cbaefc6ec92259aae8e9f9e10874d6c400051  tests/opening-book.test.mjs
9c7b7054f7898f9018256df051ae335e288f140291ce0f71622ce42dcf54a7e4  tests/book-cli.test.mjs
c0d61980f70a3cc3e40bb16c60d6a6f76360e8e3ee14a87c9ae8a0381b6b6539  tests/book-ui.test.mjs
6d806a4d72bd174e9743dd748c52e7dfa5e6ad42e92542cb8215fd5ce83dacf7  tests/policy-tuning.test.mjs
e0706a51ac8b73413d994d973e1a945c0fdd394cf2c17264b7502a9dcbf1384e  tests/policy-optimizer.test.mjs
cc36d0179334ab828fdbbfcc2f6f59edad30d1e75258168166ce020f6032c6fc  tests/policy-labels.test.mjs
3c425ff11cd0a1e724958f375e3a76c0257d3980d1882017453abd4e76b9662f  tests/build.test.mjs
afa5f77f75c46a15f7bfbdaef07662199c7361bac469f3bf4332f46abd2312ee  tests/laptop.test.mjs
7f0593835fad6a62db5022be7fbeb794b8b4ad8c8c93f6e07972719dcdfee3a5  tests/clock-ui.test.mjs
10fc86e8bc83b4195fce012b4813d4bf58f228b8fdb12be6a1ae01f3ac73e747  tests/clock-worker.test.mjs
b9618b8a8128d99f7db17ba6f94826059f616b4a1b5fb99ee4ac7fa51e89c6f6  tests/tuned-ui.test.mjs
77365eb86c5176255e06784592f9022a36ca6730c0dd3e4ce552cbf480762737  public/models/pocket.bin
45b639b0d0584b93aa472cef413c104b174d488ebc922d1c1b774c4b23cdcb85  public/models/atlas.bin
038ed43c7ab65497633289a24a66e9a28de58fe782faa470ef82dbbc448aaf3f  public/models/pocket-plus.bin
30313d65ec8b74007a546576b5234aa00a521b63ade9159f1b2ec7f30b05c4a6  public/models/atlas-plus.bin
```
