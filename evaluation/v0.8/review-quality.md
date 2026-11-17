# Offline books / UI / worker / CLI quality review

**Verdict: FAIL** — one reproduced medium-severity logic defect; no identified security blocker. Production was not changed.

Bound to base commit `c6dc9647f7a0537322ffd71f784f0a696be97413` and the complete 19-file scoped SHA-256 map in [review-quality.json](review-quality.json). Actual tracked diffs and scoped untracked files were inspected, not just the prior reviewers' conclusions.

## Blocking defect: QUALITY-1

**`tools/v8-books-fetch.mjs:21–33` — cleanup deletes a partial file this acquisition does not own.**

The `.download` name is deterministic and opened with `flags:'wx'`. When a partial already exists, the open correctly fails with `EEXIST`, but the catch handler unconditionally removes that existing partial. A concurrent or retried fetch can therefore destroy another acquisition's partial. An active first writer may continue writing an unlinked inode and then fail rename.

Reproduce without network or production writes:

```sh
node evaluation/v0.8/review-quality-probes.mjs
```

Observed: `EEXIST`, `existingPartialSurvived:false`, `finalExists:false`. The probe intentionally asserts the observed defect; its zero exit status is **not** an acceptance pass.

**Fix:** use operation-unique partial paths, or establish exclusive ownership before cleanup and only remove a file created by this operation. Preserve an existing partial on `EEXIST`. Add collision and overlapping-fetch regression tests. Then rerun the scoped tests and source-bound quality review. No production fix was made under the freeze.

## Verified results

- `node --test --test-concurrency=1 tests/v8-book*.test.mjs`: **15 passed, 0 failed, 0 skipped**; 47,705.203765 ms.
- `python -m unittest discover -s tests -p test_v8_books_extract.py -v`: **1 passed**.
- Actual three-book runtime validation and read-only offline rebuild passed, including source/evidence hashes, byte-identical outputs, counts, legal replay, weighting, same-corpus slow subset, license and FEN/ply guards.
- App fixture executes actual app code and real chess.js PGN export/loadPgn roundtrip with `BookHash` / `BookHashAlgorithm "SHA256"`; JSON provenance still uses `bookSHA256`. Model/network/DOM doubles are not real-browser or inference evidence.
- Worker and CLI fixtures exercise source/hash rejection, policy fallback, deterministic seed/provenance, cache/cancellation and UCI resets. The build test is explicitly a **source-pattern gate**, not an actual package execution.
- Both static-scan flags are harmless fixed `RegExp.exec` calls, not dynamic execution. The scan's 19 source bindings exactly match this scope. Path allowlists, enabled-book source SHA verification, strict source replay, stale-generation guards and text-only untrusted UI rendering were inspected. `SOURCE.json` parse failures propagate rather than falling back (inspection).
- Prior parent browser receipt `.cache/v8/browser/receipt.json` SHA-256 `c447ce2813f38a210d4d98a85cc34898ec81f52735d9351577d16ffe74d61557`: **20 dist bindings match**, current app/worker/index match, runner hash matches, nine matrix entries. This is prior source-bound built-browser evidence; this review did not launch a browser and does not call it live or whole-release certification.

## Nonblocking maintenance notes

- Consolidate duplicated registry validation across UI, worker and CLI; build currently checks only registry top-level shape.
- Harden extractor child cleanup on exceptions and bound physical-line allocation before accepting unusually large decompressed records. Malformed decompressor output/child lifetime was not tested independently here.
- Compiled-cache body/header hashing detects accidental corruption; it does not authenticate against arbitrary same-origin code that can rewrite both. Source bytes are SHA checked before cache use.
- Preserve fixture/actual-corpus/prior-browser/package evidence boundaries. No full Node suite rerun, release rebuild, browser launch, live download, heavy ML, commit or push occurred.

Model-evaluation provenance, weight confirmation/promotion, deployment and final documentation delivery are outside this approval. The JSON verdict is fail-closed: `passed` may be true only if both `security_concerns` and `logic_errors` are empty and source bindings still match.
