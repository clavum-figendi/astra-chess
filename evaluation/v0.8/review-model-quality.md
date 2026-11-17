# Independent V8 model-pipeline code-quality review

**Verdict: FAIL (code quality only).** Three actionable defects were reproduced in the new public-coefficient rebuild CLI. No security vulnerability was identified. Existing focused tests pass.

Base commit: `c6dc9647f7a0537322ffd71f784f0a696be97413`. Exact reviewed source/test/document SHA-256 bindings and executed commands are in [`review-model-quality.json`](review-model-quality.json). No reviewed source changed during this review.

## Blocking findings

1. **Q1 — High: empty evidence bypasses the publication gate** (`tools/rebuild-v8-models.mjs:23–32`). `approved: true` with `evidenceSHA256: {}` passes the evidence loop. No required receipt set or relationship between the requested candidate and accepted selected record is checked. In an isolated scratch tree, the real CLI exited successfully and published Pocket binary/manifest with no evidence bindings. Require the decision schema, mandatory evidence bindings and chosen-record/input consistency before output writes. This finding concerns gate implementation, not the running replay's evidence completeness.
2. **Q2 — Medium: failed commands leave partially installed binaries** (`tools/rebuild-v8-models.mjs:27–38`). A valid Pocket derivative followed by an invalid Atlas candidate exited 1 after creating the Pocket binary, while leaving the manifest unchanged. Validate/rebuild all families before any public mutation; stage and atomically publish with rollback for the binary/manifest set. Test preservation of existing sentinels on late failure.
3. **Q3 — Medium: unvalidated changed-weight metadata** (`tools/rebuild-v8-models.mjs:35`). A successful sandbox rebuild accepted `changedScalars: -1` and published `changedWeights: -1`. Derive the count from parsed base/rebuilt tensors or verify against an independently bound artifact record. Reject missing, negative and inconsistent counts.

These defects are latent: the repository currently has no release-decision file. No actual public binary or manifest was modified by this review.

## Verified

- Existing project-venv Python focused tests: **16 passed**, including exposure guards, tie selection, outcome accounting, actual CJS resolution, lineage/runtime tamper fixtures and repair objective/folding units. The discovery glob also ran one lightweight book-extraction fixture.
- Node focused tests: **3 passed**. Both relaxed candidates rebuilt byte-identically from public coefficients; wrong-base and missing-candidate inputs rejected. Sparse protected-edge and deployed-ranking tests passed.
- Python AST parsing / Node syntax checks passed. Scoped static scans found no credential-assignment, shell-injection, eval/exec or unsafe-pickle patterns.
- Sandbox CLI probes confirmed all three findings. Reproduction script: `/home/hermes/.hermes/cache/scratch/v8-quality-cli-probe.py`; results are embedded in the JSON report.
- First Python attempt used the default interpreter and failed for missing Torch. Retried with the existing project venv successfully; no installation was performed.

## Non-blocking suggestions

- Replace acceptance-critical `assert` checks with explicit exceptions, or explicitly reject optimized Python invocation; optimization removes assertions. No optimized replay was run.
- Add isolated CLI coverage for malformed/empty decisions, candidate/evidence binding, metadata and failure atomicity. The current pure-helper test does not cover the publication path.

## Scope and preservation

Reviewed the requested fitting, selection, scoring, verification, confirmation, rebuild code and focused tests, plus direct tuning helpers and the V8 provenance documentation. No fitting/export/evaluation replay, browser, build, source modification or frozen-evidence modification was performed. Active confirmation outputs were not polled/read. This is not complete-evidence acceptance, release authorization, or chess-strength/Elo certification.
