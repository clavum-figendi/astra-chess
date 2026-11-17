# V8 complete-confirmation plan — PASS (conditional)

**Static implementation preapproval only.** The complete driver addresses SPEC-1-F1 and the requested input-lineage checks. Operational closure of SPEC-1 is conditional on an independently verified completed replay under the limited reproducibility claim. The original historical freeze limitation is not repaired.

## Verified implementation

- `v8_confirm_complete.py:9–15,26–29` uses real Node resolution from `ROOT/src`, binds the actually resolved **CJS** implementation and complete-driver bytes, and augments all base runtime identity checks. Existing ESM/package/runtime/opponent bindings remain.
- Lines 24–25,31–38 enforce original frozen manifest/data-protocol/validation/test digests before each stage and compare replay selection lineage after each stage.
- Distinct `v8-confirmation-complete` / `confirmation-complete` output names preserve prior attempts and original receipts.
- Base wrapper copies the three executables byte-for-byte, fixing Node entrypoint behavior without patching original evaluation source. Exact selected-model/metric, heldout, full-PGN/decision/outcome and promotion comparisons remain intact.
- Final `resolved-lineage.json` binds the completed base receipt/pre-run digests and resolved CJS/input lineage.

## Executed checks

- `test_v8_complete_binding.py`: **3/3 passed** — real current CJS inventory, real Node main-vs-module resolution and CJS-byte digest change, lineage rejection.
- `test_v8_confirmation.py`: **3/3 passed** — actual copied executable entrypoint and identity rejection fixtures.
- Original `v8_select.py`, `v8_evaluate.py`, `v8-score-sparse.mjs` SHA-256 values still match the initial review.
- Exact reviewed source hashes/base commit are in `review-spec-complete-plan.json`.

## Required completion checks

1. Run only the reviewed source versions with Python assertions enabled. No fitting, candidate changes, relabeling, threshold revision or reselection liberty.
2. Require successful **complete-driver exit**, `receipt.json` **and** `resolved-lineage.json`. The base receipt is written before final complete-driver assertions, so its existence alone is insufficient.
3. Independently verify receipt/sidecar/pre-run hashes, all artifact digests, complete-driver source binding, actual resolved CJS inventory, original input lineage, exact selected metrics/heldout/game equality and expected game/model counts. Verify unchanged runtime/opponent identities, rather than trusting boolean fields alone.
4. Preserve all original/failed/incomplete attempts. A changed driver or wrapper requires review before replay; do not rebind old evidence.
5. Before publishing evidence, update `PROVENANCE-LIMITS.md` to name **`v8_confirm_complete.py`** and **`confirmation-complete`** explicitly. It currently credits the base wrapper with resolved-JS coverage, which that wrapper alone lacks.

## Approved claim boundary

A verified complete replay can establish **reproducibility of the already-exposed, fixed-candidate results in the recorded replay environment**. It cannot establish historical pre-exposure dependency immutability, a fresh holdout, independent statistical evidence, stronger-play/Elo claims, model-promotion approval or release certification. Boundary identity checks are not continuous anti-tamper protection or a hermetic OS proof.

No heavy replay, model evaluation, browser or build was executed; no running outputs/receipts were inspected. UI PGN/browser changes remain for source-bound final quality review. Initial/follow-up reviews and frozen originals were not modified.
