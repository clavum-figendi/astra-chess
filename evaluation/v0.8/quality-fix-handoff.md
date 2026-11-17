# QUALITY-1 fix handoff

**Fixed in implementation; independent source-bound re-review pending.** No release/model/package approval is implied.

- Kept the deterministic `<file>.download` path and exclusive `wx` open. Cleanup ownership is granted only by the write stream's successful `open` event. An `EEXIST` rejection therefore cannot delete another acquisition's partial.
- Collision regression preserves both a pre-existing sentinel partial and the prior completed archive. Overlap regression holds the first stream open after its initial bytes reach disk, rejects a second acquisition with `EEXIST`, verifies those bytes remain intact, then completes and renames the first acquisition successfully. No network or arbitrary sleep is involved.
- Added an assertion that overflow/truncation failures still remove their own partials. Hard byte cap, exact 206 range, bounded streaming/hash/backpressure and full-body timeout code are unchanged. Timeout was inspected, not independently waited out.

## Execution evidence

1. **RED, before production edit:** `node --test tests/v8-books-fetch.test.mjs`: 1 passed, 2 failed; both new regressions saw the other operation's partial deleted after `EEXIST`.
2. **GREEN, final test bytes:** same focused command: 3 passed, 0 failed (272.401195 ms). Ten additional subprocess runs all exited 0.
3. Scoped suite: `node --test --test-concurrency=1 tests/v8-book*.test.mjs`: 17 passed, 0 failed (47204.397968 ms), including offline actual-corpus rebuild/runtime validators. This run preceded only the extra owned-cleanup assertion in the existing test; the final assertion passed in the focused run and ten repeats.
4. Programmatic comparison against the archived 19-file review hash map found exactly the two assigned source/test files changed; the other 17 reviewed sources match.

## Current SHA-256 bindings

| File | SHA-256 |
| --- | --- |
| `tools/v8-books-fetch.mjs` | `2f33de59a0ff7c55919e865e4af767a833ce818d2c47355c590874971e25d1e0` |
| `tests/v8-books-fetch.test.mjs` | `70cdac72fa3414213d51796606fb88c2252383ad85b8a66c20102ada2c8674a3` |
| unchanged `data/book-sources/SOURCE.json` | `11dcdcc1c4c049e37361679e12379e66e06f86db553b5629b517f849a75289eb` |

`SOURCE.json` binds acquisition bytes, selected corpus and evidence, **not the fetch script**. It was not regenerated. Historical acquisition hashes and old reviewed-source archive remain untouched. Existing quality/books reviews and static-scan evidence bind the old script and are not current approvals for this new script; parent should obtain fresh source-bound review rather than silently rebaseline historical receipts.

Only `tools/v8-books-fetch.mjs`, `tests/v8-books-fetch.test.mjs` and these two new handoff files were edited/created. Original review-quality findings and their bug-confirmation probe remain untouched; the reviewer must independently adapt the defect-asserting probe. No acquisition, auth/paid network, heavy ML, build, browser, commit or push was performed.
