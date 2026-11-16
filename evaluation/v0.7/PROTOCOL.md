# v0.7 bounded model-improvement protocol

Before evaluating new candidates, preserve all v0.3–v0.6 results and artifacts. The new active catalogue will contain one Pocket-family model, one Atlas-family model and DeepMind 9M. Historical controls remain reproducible, not exposed as extra playing choices.

## Inspection-driven candidates

- DeepMind: inspect every actual state tensor, value-head singular values, row norms and biases (`weight-inspection.json`). The head has 128 output buckets; the largest positive bias is bucket 63, near the draw return. Test small actual head-weight/bias temperature scalings (0.95, 1, 1.05) and draw-bin bias offsets (-0.05, 0, 0.05), including the unchanged control. Also test bounded policy-supervised head fitting at learning rates 0.00002 and 0.00005, at most 12 epochs. Preserve the encoder bit-for-bit. A large draw-bin bias is a hypothesis to test, not proof of a defect or semantic understanding of hidden neurons.
- Pocket/Atlas: inspect terminal coefficient groups and protected edges (`sparse-weight-inspection.json`). Fit lower-dimensional shared groups rather than the earlier geometry-expanded heads: Pocket+ has 64 free groups, Atlas+ 82. Keep capture/mate-scale protected coefficients and topology unchanged. Use actual Stockfish bestmove/rank policy targets from existing development data, not raw-score regression. Bound fitting to three rounds of 60 epochs. Retain all four existing family controls as candidates.
- Old validation sets are development data for proposing candidates; do not describe them as untouched evidence for this revision. Existing final-test labels are not used to generate candidate weights.

## Fresh selection and evaluation

Generate depth-10 Stockfish top-four labels from 16 opening families, selected deterministically by a new hash salt from a frozen copy of the previous opening source. Assign whole families alternately to new validation and final test. Run up to 64 plies beyond the initial opening, sampling every fourth ply after 16; occasionally choose a near-best ranked alternative to diversify. Exclude every board/side identity in all prior v0.3, v0.4 and v0.5 splits. Save engine identity, source/data hashes, legal masks and group assignments.

Select model candidates on fresh validation bestmove agreement, using cross entropy when defined and deterministic tie-breaking favoring the unchanged incumbent/smaller model. Freeze selected artifacts before exposing fresh final-test labels. Evaluate the winners and relevant controls on fresh final positions and paired actual-engine games with opening books disabled. Record genuine terminal draws and unresolved caps separately. Reject candidate promotion if the final evidence materially regresses against its control; do not try another candidate after seeing the final test. Report uncertain rankings honestly rather than claiming a globally strongest model.

## Release gates

Keep only the selected Pocket and Atlas in the playing/download catalogue, with neutral family labels and recorded underlying variant IDs. If DeepMind changes, re-export and verify browser compression/choice fidelity again. UI/book modifications must not change pure policy benchmarks. Premoves, sound preference, game clocks, cancellation, legal imported positions and responsive layout require actual-browser coverage before deployment.
