# Chess Lab v0.7 — play-first interface and curated models

## Playing interface

- Board/clocks/setup/notation remain primary; analysis, FEN import, downloads and technical explanations are hidden in an initially collapsed, keyboard-accessible disclosure.
- One optional premove can be queued during the opponent's turn. It is highlighted and legally rechecked after the reply. Escape, right-click, the cancel button or disabling premoves clears it. New games, settings changes, flag fall and terminal positions invalidate the queue. Queued promotions autoqueen; ordinary promotions retain all four choices.
- Optional procedural sound defaults off. The explicit preference persists locally; enabling or muting it does not reset the game. No sound files, tracking or external sound service are required.
- Actual Chromium checks cover 320/390/768/1280px widths, clocks, promotions, cancellation races, nonzero WebAudio output and a real DeepMind reply. See UX-V7.md and evaluation/v0.7/ui-final/receipt.json. Mobile coverage is browser-viewport testing, not physical-device certification.

## Opening book

The pinned, CC0 Lichess opening corpus contributes 3,865 source paths covering all 500 ECO codes. Prefix deduplication retains 2,489 maximal paths, producing **5,575 positions and 8,190 legal continuations**, up to 32 plies. The serialized artifact is 1,013,432 bytes. All source paths, including those beyond the selection cutoff, are legally validated.

Weights are one vote per maximal unique path—not observed game popularity or neural scores. Seeded choice, exact FEN/fullmove handling and pure-policy book-off evaluation remain separate. Source, license, hashes and independent rebuild checks are in OPENING-BOOK-V7.md and the accompanying notices.

## Model selection and actual weight edits

The active website has exactly **Pocket, Atlas and DeepMind 9M**. Pocket is the underlying Pocket+ variant; Atlas is the original variant. Other variants remain in historical source/evidence but are excluded from active choices and distributed weight files.

Actual DeepMind tensor inspection covered all state tensors, head singular values, row norms and biases. Nine bounded structured head edits and two short policy-supervised fitting candidates were proposed. The selected change scales head weights/biases by 0.95 and subtracts 0.05 from draw-adjacent bias bucket 63: **32,896 scalars changed, encoder bitwise unchanged**. Fresh validation policy cross entropy improved from 1.763306 to 1.759006; bestmove hits stayed 55/96. This is a small policy-loss adjustment, not evidence of better outcome-probability calibration or stronger play.

Pocket/Atlas coefficient inspection led to actual grouped fitting of 64 and 82 free groups respectively. Those fitted candidates improved old development metrics but did not beat the retained controls on fresh validation. They are not shipped as improvements merely because their weights changed.

| Active model | Fresh validation bestmove matches | Fresh final matches |
|---|---:|---:|
| Pocket (Pocket+) | 25/96 | 24/93 |
| Atlas | 22/96 | 28/93 |
| DeepMind 9M adjusted | 55/96 | 55/93 |

Final evaluation used 16 paired games, two openings and both colors against **Stockfish 17.1 depth 3**, without book decisions. Both the previous and adjusted DeepMind models scored 3 wins / 1 draw / 0 losses. Pocket scored 0 wins / 1 draw / 3 losses; Atlas 0 wins / 0 draws / 4 losses. There were no unresolved caps. This small, shallow-engine comparison is not an Elo rating.

Selection was frozen before the fresh final set was exposed. All 189 fresh validation/test identities are disjoint from prior v0.3/v0.4/v0.5 data. The parent audit legally replayed all 16 PGNs and 569 recorded policy decisions. Reports and hashes are in evaluation/v0.7/.

## Browser and laptop artifacts

DeepMind's FP16-storage ONNX remains **17,991,221 bytes**. It preserved all 96/96 fresh validation choices of the selected float32 checkpoint. Actual browser execution matched 12/12 sampled held-out choices and exercised the new book plus cancellation. CPU WASM performs the computation locally; Rapid or Unlimited is recommended on slower devices.

The Node laptop bundle contains only Pocket and Atlas. Use `--model pocket` (alias for the selected Pocket+), `--model pocket-plus`, or `--model atlas`; `--list-models` shows actual packaged files. Removed IDs return a clear error rather than falling through to absent files. The separate DeepMind bundle contains its selected PyTorch checkpoint and Python UCI runner.

Original DeepMind weights are Google DeepMind searchless_chess, CC-BY-4.0: https://github.com/google-deepmind/searchless_chess/tree/90ae0e6b121673fc3079aaeffa047580bb600c0a and https://creativecommons.org/licenses/by/4.0/ . Changes are framework conversion, policy-supervised head adaptation, the v7 head adjustment and FP16-storage export. Transformer code is Apache-2.0; full license and ONNX Runtime notices are distributed. No endorsement is implied.

## Verification boundary

The complete Node run had 92 passes / 6 browser-dependent skips / no failures after migrating the obsolete variant-selection fixture. The subsequent CLI alias fix passed 9 focused tests and actual packaged invocation. Full UI, model parity and book tests have separate receipts; skipped tests are not counted as browser execution. Source-bound review is in REVIEW-V7-INTEGRATION.md. Hosted verification is recorded after deployment, separately from the release bytes.
