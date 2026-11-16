# Evaluation protocol — version 1

This protocol is fixed before the first model benchmark. It measures a hand-programmed neural policy, **not** grandmaster qualification.

## Puzzle test

- Source: https://storage.googleapis.com/searchless_chess/data/puzzles.csv (10,000 public puzzles used by the searchless-chess project).
- Source SHA-256: `099d54e681a07b9e82b4462aaf5436a6e833edc6f56b92ea7c2d2413f7efbe48`.
- Select 256 records by ascending SHA-256 of `astra-chess-eval-v1:` concatenated with PuzzleId. Selection is independent of difficulty, outcome or model score.
- Apply the first move in each record, which is the opponent's setup move. The model must then match **every** supplied solver move. Opponent moves are supplied from the reference sequence. Stop at the first mismatch. Report both first-move agreement and full-sequence success.
- Alternative winning moves are counted wrong by this exact-match protocol. The results measure this sample only, not the paper's whole dataset or an Elo rating.
- The model compiler never reads the sample. No coefficients are fitted to it. Public puzzles could nevertheless have appeared in the authoring LLM's pretraining; these are not certified uncontaminated positions.
- Invalid data or illegal model moves fail the benchmark rather than being excluded silently.

## Games

Each model plays 8 games against uniform seeded random legal moves and 8 against a deterministic immediate-capture/promotion baseline. Four fixed four-ply starting lines are played with colors reversed. These are deliberately weak, **unrated** baselines; winning does not establish strong chess. No opening book is used during policy inference; the starts only diversify the benchmark games.

Games use full chess.js rules, auto-threefold/auto-fifty-move draws, and a 160-total-ply cap. The cap counts as a draw and is listed separately; there is no material adjudication. PGNs and termination reasons are saved. There is no clock in the game benchmark; timing is measured separately. These results cannot be converted into an established Elo rating.

## Performance and provenance

Record SHA-256 for both model binaries and the inference files, platform/CPU/runtime, full binary bytes, and per-position end-to-end policy latency (encoding, forward pass, legal masking). Median/p95 are observations on the test host, not consumer-device guarantees. Browser smoke tests separately exercise the worker.

Run `python tools/prepare-benchmark.py`, then `npm run bench`. The first command needs public network access; the actual benchmark is local. Final results live in `evaluation/results.json`; re-running overwrites results, so retain the previous version in Git if comparing editions. Models must be frozen during each run. Any coefficient change requires a new benchmark and new hashes.

## Limits

No rated human matches or calibrated tournament are included. **Grandmaster strength is unestablished.** Test assertions prove software behavior only. Compact weight storage measures authored circuitry, not a learned knowledge-capacity frontier. Circuit topology and external rule enforcement are part of the system and must not be omitted from storage/architecture disclosures.

Dataset attribution: source project https://github.com/google-deepmind/searchless_chess; original Lichess puzzle database https://database.lichess.org/#puzzles is CC0. Source project lists original game data as CC0 and additional dataset material as CC-BY 4.0; retain this attribution for the evaluation sample/results. No dataset or trained weight from that project is used for move inference.
