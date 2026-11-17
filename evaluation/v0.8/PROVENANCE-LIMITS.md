# V8 execution provenance: original run and confirmatory replay

The original V8 experiment froze candidate bytes, first-party inference/evaluation sources and dataset digests before final testing. Independent review correctly identified missing pre-exposure bindings for the resolved JavaScript chess implementation, Python runtime/package identities and the paired opponent executable. This is an execution-provenance limitation, not observed evidence of replacement or a reason to erase the measured results. The original receipts remain unchanged.

## Separate confirmation

`tools/v8_confirm_complete.py` composes the preserved base wrapper to perform a **post-exposure, fixed-candidate confirmatory replay** in `.cache/v8-confirmation-complete`, with evidence under `evaluation/v0.8/confirmation-complete/`. Before replay it records/checks:

- the JavaScript chess shim, actual Node-resolved CJS implementation as well as browser ESM/package metadata, dependency manifest and lock;
- Python and Node executable identities/versions, installed package versions, and non-bytecode files distributed by Torch, NumPy and python-chess's `chess` package;
- the exact Stockfish executable, confirmation wrapper and original frozen inputs.

It repeats validation only to assert exactly identical selected artifacts and metrics. A changed decision is an error, not permission to select another model. It then repeats the frozen final evaluation, requires identical held-out decisions, paired-game moves/outcomes and promotion-gate results, and checks runtime/opponent identities again. No fitting, new candidates, changed labels, revised thresholds or new statistical sample are introduced. The original selector/evaluator are invoked unchanged with an isolated output root; source links and model bytes must match their recorded digests.

This is **not** a retroactive pre-exposure freeze and **not** an independent holdout. A completed replay can establish reproducibility in the newly recorded environment; it cannot prove which dependency bytes were present at every instant of the earlier run. Negative tests cover actual Node resolution and CJS bytes, package-version/opponent-digest tampering, and original input-lineage mismatches. Acceptance requires successful complete-driver exit and independently verified **both** `receipt.json` and `resolved-lineage.json`; the base receipt is written before the complete driver's final checks. Equality is checked at the recorded boundaries, not continuously, and this is not full OS/shared-library hermeticity.

No default-weight change is accepted solely on the original experiment while this review condition remains open. There is no Elo or grandmaster-strength conclusion from these small teacher-agreement and shallow-opponent samples.

The first confirmation attempt stopped during validation, before final replay: a symlinked tools directory made the unchanged Node scorer's entrypoint path check skip execution, producing empty stdout. Its pre-run manifest, wrapper and failure log are preserved under `confirmation-attempt1`; no confirmation receipt was issued. The corrected wrapper copies the three frozen executables byte-for-byte into the isolated tree instead. A regression exercises that real Node entrypoint; the original scoring/evaluation programs are not patched.

The base wrapper's later `confirmation/` attempt lacks pre-run CJS coverage and cannot by itself close the dependency-binding condition, even if its numerical replay completes. It remains separately preserved. Only the complete driver adds the actually resolved CJS binding and checks copied manifest, data-protocol, validation and test digests against the original lineage before each stage.
