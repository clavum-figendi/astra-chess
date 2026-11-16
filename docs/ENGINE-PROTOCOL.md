# Local development-engine protocol

`tools/uci-engine.mjs` and `tools/engine-games.mjs` are development tools. They run actual local chess engines as teachers/opponents; they are not part of the browser/laptop policy's move selection, are not placed under `public/`, and do not implement a replacement baseline. No model weights are changed by either module.

## Engine discovery and lifecycle

```js
import { openEngine } from './tools/uci-engine.mjs';
const engine = await openEngine({ kind: 'stockfish', timeoutMs: 15000 });
try {
  const analysis = await engine.analyze(fen, { depth: 6, multiPV: legalMoves.length });
  if (!analysis.complete || analysis.depth !== 6 || analysis.lines.length !== legalMoves.length) {
    throw new Error('Incomplete teacher labels; do not train on this as a full ranking');
  }
} finally {
  await engine.close();
}
```

Supported `kind` values: `stockfish`, `gnuchess`. Executable lookup order is explicit `path`, `STOCKFISH_PATH`/`GNUCHESS_PATH`, then repository-relative `.cache/engines/root/usr/games/<kind>`. `path` is an executable path, **not** a shell command. No sudo, system installation, credentials, network API, or paid service is used. The extracted GNU executable works with `--uci`; its directory is both its working directory and prepended to its child process's PATH. This keeps companion-executable lookup local.

`openEngine` waits for `uciok`, records the engine's actual `id name` and `id author`, parses advertised options, sets supported development controls, and waits for `readyok`. Returned fields:

- `identity`: `{kind, path, name, author}`; `path` is resolved absolutely.
- `options`: parsed advertisement objects `{name, type, raw, default?, min?, max?, vars?, value?}`. `value` records a bridge-issued setting; absent means the bridge did not override it. No generic unvalidated option setter is exposed.
- `analyze(fen, {depth?, nodes?, multiPV?, moves?})` and `close()`.

The bridge configures Threads=1 where advertised, Hash=16 MiB, Ponder=false, and OwnBook=false where advertised. Stockfish does not advertise OwnBook; GNU does not advertise Threads or MultiPV. Requesting GNU MultiPV >1 rejects explicitly. MultiPV is reset on every analysis, including back to 1. Hash contents persist across sequential analyses; create a new connection when a clean transposition table is required.

One analysis per connection is supported. Concurrent requests reject rather than share an output stream. Each handshake, ready barrier, and search has the configured timeout (default 15 seconds). A search timeout poisons the connection and kills its process group; **open a fresh engine**, do not reuse it. Unexpected exits reject pending work. Stderr is bounded to the last 8,192 characters, unterminated stdout is bounded, and `close()` is idempotent with bounded shutdown. Unix process-group cleanup also handles a GNU adapter worker that does not exit on `quit`. Use `finally` to close engines.

## Position and score contract

FEN is validated/canonicalized by chess.js. CR/LF/NUL command injection is rejected. Depth, node count and MultiPV must be positive safe integers (depth <=128, MultiPV <=256). With neither depth nor nodes, depth defaults to 4. With both, both limits are sent.

By default the bridge sends `position fen ...`, suitable for teacher positions. An optional `moves` array must contain **all UCI moves from the standard initial position**, not just a continuation. The entire array is replayed legally and its canonical final FEN must equal the supplied canonical FEN, including side/counters/rights. A mismatch rejects; history is never silently ignored. An empty array is valid only for the initial position. Successful history analysis returns `positionSource: 'history'` and uses `position startpos moves ...`; otherwise it returns `'fen'`. This preserves repetition context for matches. Custom initial-FEN histories are not supported by this API.

Analysis returns:

```js
{
  bestmove,                     // validated legal UCI root move, never a fallback
  lines: [{move, cp?, mate?, depth, nodes?, pv: [...], multipv, bound?}],
  depth,                        // depth of returned lines, absent if no PV exists
  complete, expectedLines,
  positionSource,               // 'fen' or 'history'
  limitMode, observedNodes      // largest node report, not the chosen PV's count
}
```

Scores retain **UCI side-to-move perspective**; they are not normalized to White. `cp` is centipawns; signed `mate` is the engine's UCI mate score, **not** converted to fake centipawns. Missing scores stay missing. `pv` is the engine-supplied UCI sequence, not an independently searched continuation. Root moves are checked against chess.js legal moves. `bestmove` is independent of the selected complete score iteration and may have been chosen by a later incomplete iteration.

MultiPV extraction snapshots the newest complete, exact-score iteration at one depth: every index 1..min(requested MultiPV, legal-root-count) must appear, with distinct legal root moves. Lower/upper bounds cannot make an iteration complete. A later partial depth never overwrites an earlier complete ranking. If **no** complete ranking exists, `complete=false` and only the deepest observed same-depth partial lines are returned; do not treat them as full ranking labels. Empty or malformed/diagnostic `info string` lines cannot invent scores. Always check `complete`, `depth`, and legal-root coverage before dataset generation. A ready barrier drains stale unsolicited `bestmove` output before a new search; timeout sessions are killed instead of risking a late bestmove contaminating another request. An illegal/null/`(none)` bestmove throws, including if a caller mistakenly analyzes a terminal board.

### GNU node-budget limitation

The tested GNU Chess 6.2.9 UCI adapter accepts `go nodes N` but does **not** enforce it. This was observed directly: `go nodes 300` continued through depth 10 until explicitly stopped. For GNU requests containing `nodes`, the bridge watches genuine live node reports and sends `stop` when reports reach the budget. The response is marked `limitMode: 'reported-nodes-stop'`; other requests use `'native-uci'`.

This is a **cooperative, potentially large-overshoot budget**, not equal-node benchmarking. The real 300-node test reported 10,000 final nodes before GNU honored stop. Use depth limits for comparable documented GNU experiments; do not label such GNU and Stockfish runs as equal-node matches. Node-limited searches still have the wall-clock timeout safety bound.

## Game harness

```js
import { playEngineGame } from './tools/engine-games.mjs';
const result = await playEngineGame({
  model,                         // already parsed compiled policy object
  engine,                        // openEngine connection; caller owns close()
  opening: ['e2e4', 'e7e5'],      // standard-start UCI plies
  modelColor: 'w',
  limit: { depth: 3 },
  maxPlies: 160,
});
```

Every model turn calls the actual imported `chooseMove` from `src/engine.mjs` using the supplied compiled model. No model search is added. Every engine turn passes the complete standard-start history. Engine and model moves must apply legally through chess.js. Null/illegal moves and engine errors throw; no synthetic move, material adjudication, or invented game result is substituted. Opening moves are validated and cannot continue after the game has ended.

Return fields: `{result, termination, plies, pgn, modelDecisions, engineIdentity}`. `plies` includes opening plies. `modelDecisions` includes `{ply, fen, move, elapsedMs, candidates}` for each actual model call. The harness does not close the connection, so callers can reuse it between games. Terminal checking precedes the ply cap: checkmate, stalemate, threefold repetition, insufficient material, and fifty-move draws use chess.js. Termination labels are `checkmate`, `stalemate`, `threefold-repetition`, `insufficient-material`, `fifty-move-rule`, `draw`, or `ply-cap`. A cap returns `1/2-1/2` **with `termination: 'ply-cap'`**; tally these separately from legal terminal draws. PGN includes the exact Result and Termination headers. This API starts at the standard initial position; it does not provide FEN-start matches.

## Verified local identities and options

Environment tested: Node v26.8.2, chess.js 1.4.0, Linux. Local engine root: `/home/hermes/projects/astra-chess/.cache/engines/root/usr/games/`.

| Executable | Actual UCI identity | UCI author | Explicit settings |
|---|---|---|---|
| `stockfish` | `Stockfish 17.1` | `the Stockfish developers (see AUTHORS file)` | Threads=1, Hash=16, Ponder=false; MultiPV per request |
| `gnuchess --uci` | `GNU Chess 6.2.9` | `GNU Chess team` | Hash=16, Ponder=false, OwnBook=false |

The Stockfish package filename/version says `17-1build1`; the executable actually identifies as **17.1**. Do not label it Stockfish 17.0 based on its archive name.

Stockfish advertised controls (read from its real handshake): Debug Log File; NumaPolicy; Threads [1..1024]; Hash [1..33554432]; Clear Hash; Ponder; MultiPV [1..256]; Skill Level [0..20]; Move Overhead [0..5000]; nodestime [0..10000]; UCI_Chess960; UCI_LimitStrength; UCI_Elo [1320..3190]; UCI_ShowWDL; SyzygyPath; SyzygyProbeDepth [1..100]; Syzygy50MoveRule; SyzygyProbeLimit [0..7]; EvalFile (`nn-1c0000000000.nnue`); EvalFileSmall (`nn-37f18f62d772.nnue`). Untouched options retain the engine's defaults.

GNU advertised controls: Hash [4..1024]; Ponder; OwnBook (default true, overridden false); BookFile (`book_small.bin`); NullMove Pruning (Always/Fail High/Never, default Fail High); NullMove Reduction [1..3]; Verification Search (Always/Endgame/Never, default Endgame); Verification Reduction [1..6]; History Pruning; History Threshold [0..100]; Futility Pruning; Futility Margin [0..500]; Delta Pruning; Delta Margin [0..500]; Quiescence Check Plies [0..2]; Material, Piece Activity, King Safety, Pawn Structure, Passed Pawns (each [0..400]).

SHA-256 hashes computed from the actual local files:

| File, relative to `.cache/engines/` | SHA-256 |
|---|---|
| `stockfish_17-1build1_amd64.deb` | `30d1271ab2b8316899bfcbac030f787575e831623d3ccea6a793358bc641d41f` |
| `gnuchess_6.2.9-0.1build1_amd64.deb` | `863083898ebe431b6472b27d47d1846a815af5e095a1e193ab3d416b12cfa865` |
| `root/usr/games/stockfish` | `0fd9f5995bceb762f4c87bb577b99de28f0782456b609cb09a47852bba1a4af8` |
| `root/usr/games/gnuchess` | `c20685cb4d8176182b58db1d6ad8bf6b90e0d269bfa4d29d053918a80799fe8f` |
| `root/usr/games/gnuchessu` | `20203b46a1ca2b1fcb4b5fd1a55080656ca1d64bb98c8c18cfc389efaf8721d5` |
| `root/usr/games/gnuchessx` | `ac2841ac8d0e49e4017b08894cfcc580aca9d551403fabc4a2fff64f1b7dce05` |

## Executed verification receipts

Commands were executed from `/home/hermes/projects/astra-chess`, not merely proposed:

```sh
node --test tests/uci-engine.test.mjs
npm test
```

The engine test file passed **14 tests, no failures, no skips**. The complete repository run passed **53 of 58 tests**, with **5 pre-existing browser/UI skips**, zero failures, and zero skipped engine tests (elapsed 146398.798392 ms in that run). Protocol fixture tests are explicitly named `FIXTURE`/`HARNESS UNIT`; they are not actual-engine strength evidence. They exercise partial MultiPV, mate vs cp, malformed/missing scores, illegal/null moves, exits, stderr bounds, timeouts, concurrent requests, FEN/history/limit validation, stale bestmove drainage, checkmate/repetition, and error-not-fallback behavior.

Real-engine receipts from that run:

- Stockfish initial position, depth 4, MultiPV=20: **20 distinct legal root moves**, all exact scored at depth 4; bestmove `c2c4`.
- Same Stockfish process after history `e2e4 e7e5 g1f3`, depth 6, MultiPV=29: **29 distinct legal root moves**, all exact scored at depth 6; bestmove `b8c6`. A following single-PV call returned one line, confirming MultiPV reset.
- Both engines after `e2e4 e7e5 g1f3`, depth 3: legal bestmove `b8c6`, `positionSource='history'`. Stockfish reported cp=-23, depth=3, nodes=168; GNU reported cp=0, depth=3, PV nodes=356 and total observed nodes=448. Scores are not expected to agree.
- GNU node-budget probe: requested 300; bestmove `b1c3`; `limitMode='reported-nodes-stop'`, `observedNodes=10000`. This exposes the real adapter's limitation instead of inventing precise node enforcement.
- Actual classic Pocket vs GNU, opening `e2e4 e7e5`, Pocket White, GNU depth 2, 12 total plies: `1/2-1/2`, **ply-cap**, five model calls. PGN reloaded legally and each recorded model move was independently checked against the real `chooseMove` result:

```pgn
[White "Astra Pocket"]
[Black "GNU Chess 6.2.9"]
[Result "1/2-1/2"]
[Termination "ply-cap"]

1. e4 e5 2. Nc3 Nc6 3. Nge2 Nf6 4. d4 Bb4 5. Be3 Nxe4 6. d5 Na5 1/2-1/2
```

A separate actual complete Stockfish game was also executed with this exact command:

```sh
node --input-type=module -e "import {readFileSync} from 'node:fs';import {parseModel} from './src/network.mjs';import {openEngine} from './tools/uci-engine.mjs';import {playEngineGame} from './tools/engine-games.mjs';const bytes=readFileSync('public/models/pocket.bin');const model=parseModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));const engine=await openEngine({kind:'stockfish'});try{const r=await playEngineGame({model,engine,opening:['e2e4','e7e5'],modelColor:'b',limit:{depth:3},maxPlies:120});console.log(JSON.stringify({...r,modelDecisions:r.modelDecisions.length}));}finally{await engine.close();}"
```

Receipt: **Stockfish 17.1 (White) beat classic Pocket (Black), 1-0 by checkmate, 85 total plies, 41 model decisions**, depth 3, not a material adjudication. The classic binary read by these game probes had SHA-256 `77365eb86c5176255e06784592f9022a36ca6730c0dd3e4ce552cbf480762737`. This is a protocol/execution check, not a strength estimate or tournament claim.

On machines without executable local engines, real-engine tests skip only with an explicit unavailable-path message. Supply the environment overrides or extract the binaries locally to run them. Fixture tests remain clearly separated and do not replace a missing real-engine run.
