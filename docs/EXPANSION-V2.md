# v0.2 — expanded models, measured gains and regressions

**This is a targeted improvement experiment, not a generally stronger-engine claim. No model has an established Elo or demonstrated grandmaster strength.** The v0.1 binaries remain selectable and are unchanged byte-for-byte. Defaults remain Pocket in the browser and Atlas in the CLI because the broader match results do not justify automatically replacing them.

## Downloadable sizes — available in both browser and laptop

| Model | Complete bytes | Decimal MB | Numerical parameters | Role |
|---|---:|---:|---:|---|
| Pocket | 4,423,376 | 4.42 | 514,709 | Original compact control |
| **Pocket+** | **8,465,724** | **8.47** | **980,468** | Added pawn/knight tactics and three-man ending specialist |
| Atlas | 38,397,700 | 38.40 | 4,375,054 | Original full tactical control |
| **Atlas+** | **41,074,220** | **41.07** | **4,685,447** | Full tactics plus the ending specialist |

Full bytes include sparse topology, indices, activations and metadata. Parameter counts include all stored edge weights and biases. Size growth is real new circuitry, not padded layers or copies. The generic inference interpreter and raw 768-element encoding are unchanged. Only one selected model loads in the web worker.

## What Astra added

1. **Pocket+ light tactics:** enable the existing threat/fork/loose-piece-defense construction specifically for pawns and knights, plus passed-pawn and shield-pawn terms. This is a deliberately smaller subset of Atlas's wider tactical circuitry, not a renamed Atlas.
2. **Astra-authored KQK/KRK terminal circuit:** `tools/endgame-circuits.mjs` compiles fixed geometric relations over the raw piece planes. A gate requires precisely one own rook or queen, the two kings, and no other pieces. For candidate major/king moves it marks attacked squares, accounts for own-king line blocking, counts the enemy king's available neighboring squares, distinguishes checkmate from stalemate, and rewards a reduction of king mobility. Castling is excluded from the moving-king specialist.
3. The terminal bonus/penalty is ±100 policy units, dominating local heuristic terms only inside that narrow gate. Mobility reduction adds 0.12 per newly covered escape square. These are authored coefficients, not fitted values.

Everything above is stored as ordinary sparse affine/ReLU nodes, weights, biases and edges. There is no new runtime tactical opcode, successor-board evaluation, search tree, tablebase, engine call or training. The network computes fixed candidate-conditioned relations in a single feed-forward pass. chess.js successor outcomes are used **only in tests/evaluation** to check the circuitry, not to score deployed moves.

### Boundaries

This specialist does not cover extra pawns/minors/major pieces, pawn moves/promotions, castling's rook relocation, a move that first captures the final enemy non-king piece, or long-range forced mate plans. It recognizes immediate terminal geometry in a narrow material class; it does not solve endgame conversion in general or prove an eventual forced win. General stalemate and repetition problems remain. Check/pin/exchange approximations elsewhere are unchanged.

Authorship is cumulative: the base remains Astra-directed/Sol-assisted as disclosed in v0.1. Astra directly authored the new specialist, tactical-subset integration and v0.2 delivery work. This is not a claim that the inherited system was exclusively authored by Astra.

## Fresh disjoint puzzle evaluation

The old 256 puzzles are historical/development evidence after v0.1. For v0.2 the protocol fixes positions 257–512 in the same SHA-256-sorted public dataset. The sample has **zero overlap** with v0.1. All four files were frozen before this evaluation; no coefficients were changed after its results. The sample is public and could have appeared in the authoring LLM's pretraining; disjoint here means disjoint between these two experiments, not certified pretraining-unseen.

Source dataset SHA-256: `099d54e681a07b9e82b4462aaf5436a6e833edc6f56b92ea7c2d2413f7efbe48`.
Sample file SHA-256: `c593aa89cbc5c3cc27511cbe7fd87721ebc807c539018682330f873bfbbf0174`.

| Model | First move matches | Full solution matches | Full accuracy |
|---|---:|---:|---:|
| Pocket | 51 / 256 | 27 / 256 | 10.55% |
| Pocket+ | 63 / 256 | 36 / 256 | 14.06% |
| Atlas | 105 / 256 | 70 / 256 | 27.34% |
| Atlas+ | 105 / 256 | 70 / 256 | 27.34% |

Full accuracy requires all solver moves to match the supplied reference; reference opponent replies are provided. Alternative correct moves count wrong. **Pocket+ improves reference agreement on this sample; Atlas+ shows no improvement here.** This is not an Elo estimate or a statistically certified general improvement. Compare models within this table, not against the different v0.1 sample.

## Paired games — negative results retained

Four fixed four-ply starts, both colors; 160-total-ply cap, auto-threefold/fifty-move draws, no material adjudication. Each Plus played eight games against its own unchanged classic:

| Expanded model | Wins vs classic | Draws | Losses |
|---|---:|---:|---:|
| Pocket+ | 2 | 3 | 3 |
| Atlas+ | 2 | 4 | 2 |

Pocket+ did **not** improve the match score in this small test. Atlas+ was even. The sample is too small for reliable rating claims. Against the same seeded random and greedy immediate-capture baselines:

| Model | Random W–D–L | Greedy W–D–L |
|---|---|---|
| Pocket | 3–5–0 | 2–6–0 |
| Pocket+ | 2–6–0 | 1–7–0 |
| Atlas | 6–2–0 | 5–3–0 |
| Atlas+ | 6–2–0 | 5–3–0 |

The opponents are weak and unrated. Draws remain frequent; the narrower endgame fix cannot solve positions outside its material gate. All puzzle rows, PGNs, source hashes, model hashes and termination reasons are retained in `evaluation/v0.2/results.json` and sibling files. Neither negative results nor unchanged results were omitted.

## Targeted post-freeze endgame diagnostic

After the general benchmark, a separate seeded generator selected 32 legal KQK/KRK positions with mate in one, and 32 non-mating positions offering an avoidable stalemate. No weights were changed from this diagnostic. This deliberately tests the specialist's target domain and is **not** a broad chess-strength benchmark.

| Model | Mate in one selected | Stalemate avoided |
|---|---:|---:|
| Pocket | 0 / 32 | 28 / 32 |
| Pocket+ | 32 / 32 | 32 / 32 |
| Atlas | 8 / 32 | 30 / 32 |
| Atlas+ | 32 / 32 | 32 / 32 |

This is the clearest measured gain for **both** Plus variants. It does not claim all three-man games will be won. The independent regression test also compares terminal flags over every legal move in 128 seeded three-man positions; those are development correctness tests, not additional benchmark wins. Protocol/positions/results: `evaluation/v0.2/endgames.json`.

## Runtime observations

On the shared two-vCPU Intel Xeon (Skylake), Linux x64, Node 26.8.2 host, full policy calls (encoding, legality, inference, ranking; excluding model load):

| Model | Median | p95 | Calls measured |
|---|---:|---:|---:|
| Pocket | 24.59 ms | 50.00 ms | 947 |
| Pocket+ | 27.55 ms | 65.51 ms | 1,015 |
| Atlas | 47.27 ms | 69.75 ms | 728 |
| Atlas+ | 50.87 ms | 81.54 ms | 728 |

The host was shared with engineering work, and workloads differ as policies choose different moves. These are observations, not controlled speedup comparisons or consumer-device guarantees. The larger networks incur additional work; file size alone is not RAM usage. Existing scalar format/parser limits are unchanged.

## Larger future sizes — proposals, not released models

| Proposed tier | Complete model budget | Planning memory allowance | Intended additions |
|---|---:|---:|---|
| **Browser Max** | **64–96 MB** | 320–416 MB | Pin-aware support, overloaded defenders, broader mating nets |
| **Laptop Pro** | **128–256 MB** | 512–896 MB | More conditional tactics, pawn races/opposition, additional narrow endgames |
| Laptop Lab | 256–512 MB | 896–1,664 MB | Wider composed tactical circuitry, only if Pro earns its cost |

The allowance uses `3 × binary MB + 128 MB` for copies/working arrays/runtime headroom. It is a planning estimate, not a measured bound. Browser Max is an opt-in desktop target; Pro targets an 8 GB+ laptop; Lab a 16 GB+ research machine. Bigger graphs will require a more memory-efficient compiler, validated parser-cap changes as applicable, and files above hosting limits must be chunked or hosted as release assets. None of these proposed tiers exists yet, and none has an estimated Elo. They are shown separately from actual model selectors/downloads in both the app and CLI catalogue.

**Recommendation:** improve representation quality before scaling blindly. Proceed first with Browser Max's pin/defender circuitry; only promote it after better fresh-sample and paired-game results. The present mixed results do not justify building a 512 MB network merely to claim a larger parameter count.

## Reproduction and records

- `npm run weights` reproduces all four binaries; the originals retain their v0.1 hashes.
- `python tools/prepare-benchmark-v2.py && npm run bench:v2` runs the disjoint-sample/general-game comparison.
- `node tools/benchmark-endgames.mjs` reproduces the post-freeze specialist diagnostic.
- `npm test` includes circuit, encoding, corruption, legality and laptop catalogue tests. Browser contracts additionally require `ASTRA_BROWSER_TESTS=1`, Python Playwright and Chromium.
- `python tools/browser-e2e.py --url <built-or-hosted-url>` compares each actual worker with Node and exercises all four choices, both Plus mating moves and the game controls.
- Prior reports (`REVIEW-SPEC.md`, `REVIEW-FINAL.md`, `RELEASE.md`, `RESULTS.md`) are v0.1 evidence, not approvals for this revision. v0.2 receipts are kept separately.
