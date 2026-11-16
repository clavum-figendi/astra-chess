# Astra authored neural chess circuits

## What this is

Pocket and Atlas are original, manually authored **sparse feed-forward affine/ReLU networks**. They are neural circuits implementing selected chess heuristics, not trained chess policies. The compiler expands authored rules into scalar neurons, sparse weighted connections, biases, activation flags and output indices. Those tensors **and the complete topology** are distributed in each `.bin` file.

Authorship: Astra directed the architecture and personally authored circuit revision 2's phase-gated king activity and open/semi-open rook-file rules. Hermes routed the initial implementation workers to `gpt-6.1-sol`; they supplied the initial compiler/runtime and UI. This is Astra-directed, Sol-assisted work, not exclusively Astra-generated weights. The assistance is disclosed in binary metadata and the manifest as well as here.

Neither model has an established Elo. Grandmaster strength is **not established**. Atlas has more tactical circuitry, which does not by itself establish that it plays better. The unit tests are deliberately authored development fixtures, not evidence of general playing strength. Independent held-out evaluation belongs in the separate evaluation report; the model author did not inspect its puzzle sample or outputs while authoring these circuits.

There is no pretrained network, training/fitting, game-tree search, minimax, MCTS, rollout, successor-position score, opening book, tablebase or external engine policy. The only third-party chess component in the move-selection path is chess.js, used for FEN validation, reading the raw board and obtaining the legal move/game-end mask. Its internal legality calculations are not network evaluations and their check/mate/SAN annotations are not used as score features.

## Runtime boundary

`src/engine.mjs`:

1. Validates FEN and reads whose turn it is.
2. Produces 768 raw binary board inputs: twelve 64-square planes in `own p,n,b,r,q,k; enemy p,n,b,r,q,k` order. `a1=0, h1=7, a8=56`. For Black, **ranks only** are reflected; files remain unchanged. Thus own pawns always advance toward increasing canonical ranks. An empty square is twelve zeroes, not a thirteenth feature.
3. Calls the generic network once for the current board.
4. Looks up a policy output for each legal UCI move, masks all other outputs, sorts by score descending and then UCI string ascending, and returns the first move and at most five candidates.

The output index is `(from * 64 + to) * 5 + promotion`, where promotion is `0=none, 1=q, 2=r, 3=b, 4=n`. It is an index mapping, not a runtime chess heuristic. Multiple impossible outputs refer to a shared zero neuron; they are not thousands of padding neurons. Game-end masking also handles insufficient material and the fifty-move rule. A single FEN cannot reveal threefold repetition history.

`src/network.mjs` has no chess rules, pieces, attacks or positional features. It interprets arbitrary dimensioned sparse affine/ReLU graphs in topological order. It uses only weighted sums and optionally `max(0, sum)`, with float32 stored tensors and float64 accumulators. There is no special tactical opcode or model-ID dispatch. All candidate scoring logic described below lives in the binary topology and numerical tensors. Tests replace the entire policy with constant-output networks to verify that only legal masking and deterministic ordering remain outside the network.

The raw input does not include castling rights, en-passant rights, clocks, history or move counters. Rights affect legal masking, not neural scores. Castling and en-passant candidate relationships can still receive authored scores where the legal mask permits them.

## How arithmetic becomes chess circuitry

For valid board one-hots, occupancy is the sum of the twelve input planes at a square. Most internal indicators are exactly zero or one:

- An unobstructed slider attack is `ReLU(piece_at_origin - sum(intervening_occupancies))`. Bishop/rook/queen geometry and every intervening square are expanded at **compile time** into graph connections.
- Pawn, knight and king attack geometries become direct connections from their raw piece planes.
- A Boolean AND of `n` binary indicators is `ReLU(sum(indicators) - (n-1))`.
- Boolean OR is `sum - ReLU(sum - 1)`.
- Moving-source, target-piece, support and attack conditions are composed with those gates.

The destination-risk circuits encode a static relationship between a raw board, a candidate origin and a candidate destination. They omit the origin from blocking/support terms, so a piece does not defend itself from its departing square, and so retreating along an opened rook ray is recognized. This is fixed circuitry over the **same raw input**, not a loop that constructs or evaluates successor boards. It does not create a representation of all pieces after a move.

Compilation hash-conses identical arithmetic subgraphs. A final backward reachability pass removes every neuron not contributing to any policy output. Tests verify that all stored neurons are output-reachable. No random seed or external model/data download is involved.

## Pocket circuitry

- Full current-board pawn, knight and king pseudo-attacks, plus blocked bishop/rook/queen rays for both sides.
- Destination danger and own support conditioned on the candidate source vacating.
- Capture material: pawn 1, knight 3.2, bishop 3.35, rook 5, queen 9. No king-capture reward.
- Approximate exchange danger using the cheapest attacking class. If `v` is the mover's value, the risk is approximately `v` when unsupported, or `max(0, v - cheapest_attacker)` when supported. Minor attackers are conservatively grouped at 3.2. Destination risk is multiplied by 1.18; escaping comparable current danger receives 1.10. These are hand-authored coefficients, not fitted statistics. This is **not** full static exchange evaluation or a recapture tree.
- Hanging-piece escape incentives, pawn advancement/central files, knight/bishop development and centralization, modest rook/queen placement, an early-queen penalty proportional to undeveloped home minors, and a castling bonus.
- En-passant material reward from the raw relationship between a diagonal own pawn, the adjacent enemy pawn and an empty destination, restricted to the relevant ranks. The legal mask alone decides whether that capture right exists.
- Promotion material gain and destination risk at the promoted piece value, with distinct queen/rook/bishop/knight outputs.
- Astra revision 2: when no enemy queen or rook remains, a binary ReLU gate cancels the king's home-rank preference and rewards centralization (0.22 per Manhattan-center unit) and approach to the enemy king (0.12 per Chebyshev-distance unit). This is an endgame heuristic, not opposition or mate proof.
- Astra revision 2: rook moves receive the difference in semi-open-file bonuses (0.18, no own pawn) and open-file bonuses (additional 0.30, neither side's pawns). Both conditions are raw-board affine/ReLU gates saved in the model, not runtime feature code.

## Additional Atlas circuitry

Atlas genuinely extends the graph; it is not a widened copy or an arbitrary repeat of Pocket:

- Candidate-conditioned **new** attacks by the moved piece, with current blockers and source-vacating ray corrections. Existing attacks by that same piece are subtracted so merely maintaining an old threat does not get a fresh-threat bonus.
- Safe new material threats, checks and a nonlinear multi-target fork bonus. These do not prove that a threatened piece will be won.
- Destination safety gates allow supported checks adjacent to the enemy king when the king is the only pseudo-attacker; an enemy king cannot freely capture a protected queen. This gives a useful supported-queen checking pattern without calling a mate detector.
- Rook/queen checking lines against an enemy back-rank king boxed by its pawns receive an extra bonus. Interpositions, captures and all escape conditions are not exhaustively proved, so this is a **pattern**, not a guaranteed mate test.
- Extra penalty for vacating a straight or diagonal shield between an enemy slider and a valuable own piece. Moving onto the same shielding ray or capturing that slider does not incur this particular penalty.
- New defense of a currently attacked, otherwise unsupported own piece.
- Passed-pawn advance bonuses based on absence of enemy pawns ahead on the same/adjacent files, and penalties for moving the shield pawns of an already castled king.

## Binary format and integrity

All integers and float32 coefficients are little-endian. `parseModel` accepts an `ArrayBuffer`.

The 40-byte header is:

| Offset | Field |
|---|---|
| 0..7 | UTF-8 magic `ASTRANN1` |
| 8 | uint32 format version, currently 1 |
| 12 | uint32 input count |
| 16 | uint32 neuron count N |
| 20 | uint32 sparse edge count E |
| 24 | uint32 output count O |
| 28 | uint32 JSON metadata byte length M |
| 32 | uint32 payload byte length |
| 36 | uint32 CRC-32 of the full payload |

The payload is JSON metadata padded to a four-byte boundary, followed by:

1. `uint32[N+1]` sparse row pointers;
2. `float32[N]` biases;
3. `uint32[N]` activations (`0=affine, 1=ReLU`);
4. `uint32[E]` source indices;
5. `float32[E]` edge weights;
6. `uint32[O]` output indices.

Inputs occupy value indices `[0, inputCount)`. Neuron `n` occupies `inputCount+n`; every edge to it must come from a strictly earlier index. Outputs may reference an input or a neuron. This is a topologically ordered feed-forward DAG, not recurrent inference.

The parser checks magic/version, dimensions and resource caps, exact byte length, checksum, valid JSON metadata, finite coefficients, monotonic sparse row pointers, activation codes, strictly prior sources and valid output indices. CRC-32 detects accidental corruption; it is **not** an authenticity signature. `manifest.json` publishes independent SHA-256 hashes.

## Frozen artifact accounting

Reproduce from the repository root:

```sh
node tools/compile-models.mjs
node --test tests/engine*.test.mjs
sha256sum public/models/pocket.bin public/models/atlas.bin
```

| Model | Complete binary bytes | Neurons | Edge weights | Parameters (weights + all biases) | Tensor bytes | Topology bytes | Header + metadata bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pocket | 4,423,376 | 55,865 | 458,844 | 514,709 | 2,058,836 | 2,364,220 | 320 |
| Atlas | 38,397,700 | 828,757 | 3,546,297 | 4,375,054 | 17,500,216 | 20,897,168 | 316 |

Zero biases are counted as stored scalar parameters. Indices, row pointers and activation flags are **not** called learned parameters, but their bytes are counted in complete file sizes. Pocket has 42,071 ReLU and 13,794 affine neurons; Atlas has 710,495 ReLU and 118,262 affine neurons. The 768 external input values are not counted as neurons. Both expose 20,480 policy indices.

- Pocket SHA-256: `77365eb86c5176255e06784592f9022a36ca6730c0dd3e4ce552cbf480762737`
- Atlas SHA-256: `45b639b0d0584b93aa472cef413c104b174d488ebc922d1c1b774c4b23cdcb85`

Forward work arrays are 616,904 bytes for Pocket and 6,800,040 bytes for Atlas, in addition to model tensors/topology, parser copies and chess.js state. Compilation uses substantially more temporary memory than inference. See `EVALUATION.md` and `../evaluation/results.json` for measured final-model timing; it is not a browser/laptop performance guarantee. Measurements from circuit revision 1 are intentionally not reused for revision 2.

## Limits that matter in actual play

The circuits reason about selected static current-board relationships. They do not solve long combinations, forced recapture sequences, overloaded defenders, pins, discovered checks in general, zugzwang, endgame technique, repetition planning or guaranteed mate/stalemate avoidance. Attack indicators are pseudo-attacks and may include pinned attackers or defenders. The exchange approximation can overvalue a defender that cannot safely recapture, and Atlas can value a threat that the opponent can parry.

The en-passant material reward is present, but the secondary opening of lines after the captured pawn disappears is not fully represented. Atlas promotion outputs use promoted values for material/safety, but its new-threat shapes still use the pawn before promotion. Castling's rook relocation and consequent tactical changes are not comprehensively modeled. These omissions can cause serious mistakes, including hanging a queen despite passing specific safety fixtures.

Every legal move comes from the network ranking; there is no hidden stronger fallback. These models are an auditable authored-circuit research artifact. Sensible moves in examples and passing tests do not establish general competence, any Elo, or the original grandmaster-strength goal.
