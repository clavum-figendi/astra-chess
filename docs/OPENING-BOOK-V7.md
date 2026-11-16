# V7 CC0 opening book

## Source, rights and distribution

The book is derived from **Lichess chess opening names contributors**,
[`lichess-org/chess-openings`](https://github.com/lichess-org/chess-openings),
pinned to commit
[`3ba6b20d31b2e6125cb0e6a2e792f400717d9d39`](https://github.com/lichess-org/chess-openings/tree/3ba6b20d31b2e6125cb0e6a2e792f400717d9d39).
The upstream [README copyright section](https://github.com/lichess-org/chess-openings/blob/3ba6b20d31b2e6125cb0e6a2e792f400717d9d39/README.md#copyright)
states that the facts are public domain and any qualifying copyright is
released under the **CC0 1.0 Universal Public Domain Dedication**.
The complete upstream legal text is preserved verbatim in
`data/openings/COPYING.txt` and `docs/OPENING-BOOK-COPYING.txt`.
CC0 is not an attribution/share-alike license; this notice records provenance,
not a new restriction or a claim that Lichess endorses this application.
This dedication covers the imported data, not the application's code or models.

`data/openings/SOURCE.json` records SHA-256 hashes for all five TSVs,
`README.md`, and `COPYING.txt`. An independent online audit downloaded those
seven files from the exact raw GitHub commit and compared remote bytes,
local bytes, and manifest hashes. All matched; URLs, byte counts, hashes,
and the audit timestamp are in `OPENING-BOOK-V7-SOURCE-RECEIPT.json`.
No moving branch, opening explorer, games, or network service is consulted
when rebuilding or selecting a move.

For public distribution ship `openings.json`, `OPENING-BOOK-NOTICE.txt`, and
`docs/OPENING-BOOK-COPYING.txt` together. The existing site builder recursively
copies `public/` and `docs/` to the website and `docs/` to the laptop archive;
therefore the complete dedication travels with both distributions. Keep this
provenance document with the laptop's `docs/` directory. Packaging is owned by
the main build task; this audit does not claim to have built or inspected a ZIP.

## Import and weighting

The five vendored TSVs contain 3,865 named paths: A 823, B 781, C 1,250,
D 644, E 367. They cover every one of the 500 ECO codes A00–E99.
The importer validates the three-column header and identities, removes PGN
move-number tokens, and rejects unexpected PGN syntax before strict SAN replay.
There are 3,865 unique SAN paths and no exact duplicate rows in this revision.
Of these, 1,376 are strict prefixes of longer paths; only 2,489 maximal paths
are independently weighted. Each gets one vote. Thus a named parent position
does not create an extra vote just because it also has named children.

The terminal retained lines directly carry 465 ECO codes, **not 500 terminal
codes**. Nevertheless all 3,865 source paths survive as retained paths or exact
validated prefixes, and all 500 codes have a legal in-book representative.
Original shorter names remain recoverable from the vendored source, not
necessarily from runtime line metadata. These are curated opening-name paths,
not game-frequency, outcome, popularity, evaluation, or neural-score weights.
At transpositions, legal continuations at the same absolute ply are combined.

## Reproducible artifact and full validation

From the repository root with Node and the repository dependencies installed:

```sh
node tools/build-opening-book.mjs
node --test tests/v7-book.test.mjs tests/opening-book.test.mjs tests/book-cli.test.mjs
```

The builder verifies all source checksums before importing and writes
`public/openings.json` plus `data/openings/STATS.json`. Serialization is
compact JSON with a trailing newline, stable source order, no timestamps,
and no measured timing in the artifact or stats. The tests rebuild entirely
in memory and compare **every byte** with the checked-in artifact and every
stats field with `STATS.json`.

| Property | Verified value |
| --- | ---: |
| Retained maximal paths | 2,489 |
| Sum of retained path lengths | 26,091 plies |
| Distinct strictly validated SAN prefixes | 8,801 |
| Exact position keys | 5,575 |
| Weighted move/absolute-ply continuations | 8,190 |
| Selection boundary | 32 plies; stored indices 0–31 |
| Longest fully validated path | 36 plies |
| Artifact size | 1,013,432 bytes |

Artifact SHA-256:
`dc6398f617d58dc5e7697eea46452a465326cac808bc60f34d2439f5deef5d3d`.

The compiler validates every SAN edge, including plies 33–36 beyond the
selection boundary. A shared-prefix trie avoids replaying identical prefixes,
but no serialized position is trusted. Tests compare the entire result against
an independent original-style per-line strict compiler, including floating
weight accumulation and insertion order. Every one of the 8,190 stored
continuations is separately replayed legally at its recorded side and fullmove.
An intentionally illegal move *after* a smaller cutoff must still throw.
Timing is machine/load-dependent: the audit observed about 7 seconds for the
trie and 15 seconds for independent per-line replay while other tasks ran;
these observations are not a fixed performance promise.

## Runtime contract and exact FEN behavior

The public exports and return shape remain unchanged:
`positionKey`, `seededRandom`, `compileBook`, `chooseBookMove`;
book schema `version: 1`; move result
`{move, source: 'book', candidates: [{move, weight}], elapsedMs}` or `null`.
The compiler's default cutoff remains 12 for callers that omit it; the expanded
artifact explicitly requests 32. Existing fixed-seed replay is deterministic
for the same book and call sequence. A new corpus intentionally changes the
weighted distribution; it does not promise the old 42-line corpus's moves.

Keys preserve the first four FEN fields: placement, active side, castling,
and en-passant. The fullmove and side independently determine absolute ply;
equal boards reached at a different move number must not gain eligibility.
Halfmove clocks are not identity, but still feed terminal/draw checks.
Most importantly, lookup uses the **original supplied FEN**, not a chess.js
regenerated FEN: a phantom non-capturable EP target must miss rather than be
normalized into a false book hit. Generated FENs follow chess.js's legal-EP
normalization, while imported key identity remains exact. Tests cover phantom
EP, castling differences, fullmove mismatch, terminal fifty-move states,
illegal candidate filtering, disablement, and transpositions.

Selection validates terminal state, absolute-ply eligibility and current legal
moves before weighted sampling. Candidates expose weights, not neural scores.
The policy-only selector is separate; explicit `--no-book` exercises real model
inference. CLI/UCI tests verify seeded replay, policy fallback, imported phantom
EP misses, and repetition draws. History-sensitive repetition cannot be
established from a FEN alone, so integration callers must keep their existing
history/draw guards.

The browser worker recompiles the full line list on load and resolves its
book relative to its module; this audit inspected those call sites but did not
run a browser (browser verification belongs to the separate UI task).
No historical evaluation evidence or `.cache/v7/original-openings.json` was
modified. Evaluations using the old book must explicitly retain that fixture;
changing an old hard-coded count to 2,489 is not a historical-data migration.

## Review evidence and scope

`OPENING-BOOK-V7-REVIEW.json` records commands, process exit status, and captured
Node test output. The source receipt separately records the online byte audit.
The review covers local rebuild, full corpus legality, API compatibility,
seeded sampling, CLI/UCI fallback and exact-key semantics. It does not certify
browser behavior, model quality, model packaging, or deployment state.
