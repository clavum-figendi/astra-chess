# v0.3 real-engine optimization protocol (predeclared)

Request: improve weights against actual engines using any suitable strategy. Search-free **inference** remains the product boundary. Engine-guided automatic coefficient fitting is now used and must be labelled **engine-tuned**, not training-free or purely hand-written. Existing published binaries remain immutable controls; no engine executable or teacher dataset is bundled in deployed move scoring.

## Scope and stopping rule

A finite run cannot prove 'fully optimized'. Optimize the output-head coefficients of the authored Pocket+/Atlas+ feature networks, tied into interpretable numerical groups. This searches a restricted family, not every possible weight/topology. Preserve capture-input coefficients and the ±100 terminal specialist gates; bound other nonnegative multipliers to a declared range. Record exactly which binary coefficients change.

Use up to six optimization rounds/checkpoints per model, select by validation centipawn regret, and stop a trajectory after three consecutive rounds without a >=1 cp improvement. Maximum local compute for this pass: two hours of engine generation/tuning/matches (no paid/cloud compute). Record whether plateau or cap stopped it; never report global optimality. If score saturation against strong engines prevents match discrimination, report it rather than secretly reducing engine strength to produce wins.

## Engines

Project-local APT extraction, not system modification. Ubuntu package stockfish 17-1build1 executes as Stockfish 17.1; GNU Chess 6.2.9-0.1build1 executes as GNU Chess 6.2.9. Pin executable hashes and report actual UCI identities and supported options. One thread, small hash, no book or ponder where configurable. Engines are evaluation/training dependencies only; preserve license attribution and retrieval instructions without shipping their binary blobs to Pages.

## Data and objective

Generate deterministic independent trajectories using actual engines and previous frozen models, from a fixed varied opening list. Split by trajectory/opening group, **not individual neighboring positions**, into training, validation and final test. Deduplicate raw board identities across splits, excluding opening overlaps. Fix a finite sample quota before optimizing. Obtain Stockfish MultiPV scores for every legal move at a fixed declared depth, complete same-depth iterations only. Keep score perspective side-to-move, preserve mate scores separately and use a documented finite mate surrogate for fitting. No invented missing labels.

Cache raw network activations for legal moves; group only terminal affine head edges not consumed by other neurons. Fit multipliers with projected, regularized supervised optimization over these cached features. Cache predictions are checked against actually rewritten/parsed binary inference, accounting for float32 rounding. Numerical tuning maps are development artifacts, never runtime heuristic code.

Before final tests, freeze chosen multiplier vectors and serialize real binaries with engine-tuned provenance. Use final test only once, after selection. Public puzzle sets already used in v0.1/v0.2 are not fresh evidence and will not select candidates.

## Match protocol

Compare frozen parent and tuned binaries against BOTH Stockfish and GNU Chess. Use paired colors from declared starts, fixed engine node/depth limits, full move history, actual legal termination, and a declared ply cap. Report capped draws separately, engine errors as failures (not draws), and all losses. Save PGNs, settings, model/engine/source hashes and timing. Small game counts do not establish Elo or statistical certainty. Defaults change only if qualification is supported; otherwise retain originals and expose tuned artifacts as experimental.

## Ownership/API

Parent owns weight editing/optimization, dataset runner, final tournaments, UI integration and publication. Engine worker owns only tools/uci-engine.mjs, tools/engine-games.mjs, tests/uci-engine.test.mjs, optional tests/fixtures/uci-* and docs/ENGINE-PROTOCOL.md.

UCI bridge: async openEngine({kind,path?,timeoutMs?}) -> {identity,options,analyze(fen,{depth?,nodes?,multiPV?,moves?}),close()}; analyze result {bestmove,lines:[{move,cp?,mate?,depth,nodes?,pv:[]}],...}. Optional moves is full standard-start history and must match FEN. Tournament helper playEngineGame({model,engine,opening,modelColor,limit,maxPlies=160}) -> {result,termination,plies,pgn,...}. No overlapping ownership of model/runtime files.

## Acceptance

Actual executable opponents tested; no synthetic responses. Test-first numerical rewrite/cache parity and bounds. Reproducible split/optimization receipts. At least baseline and several real weight candidates evaluated, selected models genuinely rewritten, independent review, browser/Node parity and extracted laptop execution before any promotion/publication. Explicitly distinguish observed optimization from unmet global-optimality/grandmaster goals.
