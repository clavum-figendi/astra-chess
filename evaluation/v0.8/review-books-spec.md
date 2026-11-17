# Independent V8 opening-book SPEC review

**PASS — scoped to the frozen offline book sources, acquisition and validator.** This is not a playing-quality, UI/build, deployment or release certificate. Hash binding for every reviewed source, artifact and test is in `review-books-independent.json`.

## Executed checks

- Six Node book tests passed, none failed/skipped, using one test thread and `--max-old-space-size=128` (34.19 s). Python extractor test passed.
- Independently replayed **all 71,697 retained SAN plies across 3,000 games** using strict `Chess.move`, without using `compileBook` to derive expected empirical positions. Every serialized position, UCI continuation, absolute ply and game-count weight matched both empirical books. Reproducer: `review-books-independent.mjs`; results/hashes: `review-books-independent.json`.
- Existing tests actually rebuilt snapshots in memory byte-identically, checked source/evidence hashes, replayed all three runtime books, and exercised illegal/tampered/truncated rejection, exact ply/EP identity, transpositions and seeded/injected RNG. Independent checks additionally exercised cutoff and terminal rejection. No frozen corpus or runtime asset was rewritten.

## Counts and scope

| Choice | Actual games | Positions | Bytes | Runtime cutoff |
|---|---:|---:|---:|---:|
| ECO, unchanged default | Named paths, not sampled games | Existing corpus | 1,013,432 | 32 plies |
| Lichess 2200+ | 3,000 | 12,332 | 1,540,282 | 12 plies |
| Lichess 2200+ slow | 253 | 1,556 | 182,086 | 12 plies |

The selected source has 3,000 distinct IDs, both ratings at least 2200, and 2,747 blitz / 244 rapid / 9 classical games. Slow is **exactly the rapid/classical subset of that same corpus**. Retained source depth is at most 24 plies; all those moves were independently replayed, including beyond the runtime cutoff. Runtime path weights sum actual games, including shared/truncated paths, rather than unique-path votes. This is a chronological prefix sample, not an independent second database, representative population estimate, FIDE-rating claim or full-database popularity product.

## Rights and provenance

The preserved primary `database.lichess.org` page explicitly grants CC0 commercial use, publication, modification and redistribution and links the exact September export. Parent separately reports freshly confirming that page; this reviewer inspected preserved primary evidence, not a new grant-page fetch.

The shipped **7,048-byte full CC0 legal text** matches preserved original SHA-256 `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499`. Independently fetched the official alternate **`https://creativecommons.org/publicdomain/zero/1.0/legalcode.en`**, HTTP 200, and compared the Statement of Purpose and all substantive sections 1–4 against shipped text: equal after whitespace normalization and removing textual list markers represented by HTML lists. Original disclaimer is present. Receipt: `review-books-license-check.json`; original official HTML is preserved. **Did not refetch `legalcode.txt`; the parent's separate request was denied with 403.**

Masters is correctly **unavailable**, with preserved anonymous 401 receipts and unestablished database redistribution rights. No Masters corpus is fabricated; no denied explorer endpoint was retried, credentials sought, or paid calls used.

## Acquisition and completeness

Hashed the existing ignored compressed prefix: exactly 100,000,000 bytes, SHA-256 `10786e08ae7308ab12e3463154a66b061548d6610e5428b61c04a8b8e0807888`, matching SOURCE and the preserved HTTP 206 receipt (`bytes 0-99999999/29224520887`). Did not reacquire the prefix.

Source inspection confirms pre-network 200 MB cap, fixed public official URL, exact 206/range checks, streaming backpressure and digest, exact body count, partial cleanup, and a 120-second abort timer covering body consumption. Tests reject ignored ranges, overflow, truncation and oversized requests. Full timeout expiry itself was not injected or waited out here.

Extractor requires an explicit completed result matching the PGN header, minimum ratings, allowed rated speeds and no setup position. Expected truncated-zstd boundary is not accepted as implicit PGN completion. The receipt's 306,874 encountered / 306,837 completed / 5,209 qualifying counts were inspected, **not independently re-extracted here**. Neither source retention nor this audit claims validation of unretained later original-game moves. No player names, clocks or analysis annotations occur in selected NDJSON; IDs/date/time/control are retained provenance metadata alongside ratings/speed/moves.

## Limits and nonblocking note

- UI/browser/CLI packaging, benchmark quality and release gates belong to other reviewers.
- Strict validation establishes source consistency and legal moves, not corpus authenticity through cryptographic upstream signatures or playing strength.
- Historical `HANDOFF.md` still uses obsolete `newtests/` paths; normative `BOOK-SOURCES-V8.md` and actual tests use `tests/`. This does not affect functionality.
- Only review/evidence files were created. No production source, weights, corpus, docs or build output was changed.
