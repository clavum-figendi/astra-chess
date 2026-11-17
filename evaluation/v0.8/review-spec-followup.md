# V8 spec follow-up — REQUEST_CHANGES

## Qualification: accepted

`PROVENANCE-LIMITS.md` correctly distinguishes the original incomplete runtime freeze from a later **post-exposure, fixed-candidate reproducibility replay**. It preserves old receipts, disclaims fresh holdout/Elo evidence and retrospective immutability, and leaves defaults unchanged. This is the right claim boundary.

## SPEC-1 cannot yet close on the current wrapper receipt alone

**SPEC-1-F1 (medium): the wrong chess.js implementation is frozen.**

`tools/v8_confirm.py:20` hardcodes `node_modules/chess.js/dist/esm/chess.js`. The actual bare import in `src/chess.mjs` resolves under Node to **`node_modules/chess.js/dist/cjs/chess.js`**, through package.json `main` (line 5). The `module` field at line 6 does not change Node resolution. A read-only `import.meta.resolve('chess.js')` probe confirmed the CJS path. That file is not in the wrapper identity list, so before/after checks can miss changes to the bytes actually used by sparse selection/evaluation. A lock or package metadata digest is not an installed-file digest.

The two negative tests pass, but both mock `runtime_identity`; they test equality rejection, not whether its real file inventory covers loaded code.

**Action:** Do not modify the active hash-bound wrapper in place. Preserve this attempt and limitation. An accepted separately named replay must resolve chess.js from the actual source importer, bind the resolved CJS bytes before replay, and reject tampering of those bytes. Add a coverage test that does not mock away path selection. Keep the browser ESM binding too if desired; it is not a substitute for CJS. Newly captured post-run hashes cannot supply the missing pre-replay binding for the current attempt.

## Otherwise sound static design

- Isolated outputs; unchanged selector/evaluator invoked with redirected ROOT.
- Candidate bytes checked and reused, not fitted or regenerated.
- Exact original selected winner/control records and metrics required; no liberty to select a different result.
- Exact heldout position records, summaries, promotion gates, game keys, complete PGNs, decisions and outcomes required.
- Stockfish binary, Python/Node binaries, package versions and listed package files are included, checked at replay boundaries.
- A separately named pre-run plan and completion receipt bind the replay, not the historical run.

## Conditions for a later limited-scope PASS

After resolving the actual-loaded-JS gap, independently verify the completed receipt and its artifact digests, exact equality and game/model counts. Also compare replay selection `manifestSHA256`, `dataProtocolSHA256`, and `validationSHA256` with the original frozen fields and copied test digest with the original protocol: the wrapper currently compares selected records but not those lineage fields explicitly.

Such a receipt can close the operational SPEC-1 condition **for the explicitly qualified reproducibility claim only**. It cannot repair the original pre-exposure provenance or create independent statistical evidence. Browser/build/release gates remain separate.

## Executed checks and limits

- Node resolution probe confirmed CJS implementation.
- `test_v8_confirmation.py`: **2/2 passed** (mocked identity fixtures).
- No running confirmation outputs/receipt were inspected or polled. No model evaluation, full runtime scan, browser or build was run. Parent-reported completed-run audits and full-suite counts were not independently rerun here.
- Exact source hashes/base commit are in `review-spec-followup.json`. Initial review documents and all original frozen files remain untouched.
