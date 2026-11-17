# V8 opening-book sources

## Shipped choices

`public/books/manifest.json` is the offline registry (`version: 1`, `default: "eco"`). Resolve every `file` and `licenseFile` relative to the manifest URL, **not** the page URL. The original `public/openings.json` and ECO compiler are unchanged.

| ID | Actual sampled games | Runtime positions | Runtime depth | Bytes |
|---|---:|---:|---:|---:|
| `eco` | Named repertoire, not game counts | Existing ECO corpus | Existing 32 plies | 1,013,432 |
| `lichess-2200` | 3,000 | 12,332 | 12 plies | 1,540,282 |
| `lichess-2200-slow` | 253 | 1,556 | 12 plies | 182,086 |

The first empirical profile contains 2,747 blitz, 244 rapid and 9 classical games. The slow profile is exactly the **rapid/classical subset of the same 3,000-game corpus**, not another database. Both players had Lichess ratings of at least 2200 at game time. This does not imply FIDE ratings, titles or over-the-board play. No bullet or ultrabullet games are included.

The empirical runtime snapshots intentionally stop at six full moves to bound worker-side strict validation cost. The selected move-only source retains up to 24 plies per game; offline builds strictly validate **all** of those retained moves, including those beyond the 12-ply runtime cutoff. Nothing claims that later original PGN moves were retained or independently replayed.

`Masters` is explicitly recorded under `manifest.unavailable`, not under playable `books`: anonymous `/masters` and `/lichess` explorer probes returned HTTP 401. Those original probe receipts are preserved. No denied endpoint was retried during recovery, no credentials were used, no paid service was called, and no Masters data was fabricated. Server software licenses are not treated as a grant to redistribute its database.

## Primary source and rights

Official export: <https://database.lichess.org/standard/lichess_db_standard_rated_2026-09.pgn.zst>.

The preserved primary page, `data/book-sources/evidence/database.txt`, says:

> Database exports are released under the Creative Commons CC0 license.
> Use them for research, commercial purpose, publication, anything you like.
> You can download, modify and redistribute them, without asking for permission.

It also links the actual September 2026 monthly export. This is the basis for the CC0 decision, not a software repository license or inferred explorer rights. The complete CC0 1.0 legal code was retrieved directly from <https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt>, saved as evidence, and shipped without abridgement as `public/books/CC0-1.0.txt` (7,048 bytes; SHA-256 `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499`). Preserve that file in distributions alongside the books.

## Acquisition receipt and sample limitations

Only bytes `0-99999999` of the 29,224,520,887-byte published compressed export were fetched: HTTP 206, exact `Content-Range`, recorded ETag and last-modified response. The durable headers are `evidence/prefix-response-headers.txt`.

- Compressed prefix SHA-256: `10786e08ae7308ab12e3463154a66b061548d6610e5428b61c04a8b8e0807888`.
- Encountered PGN game records: 306,874.
- Records ending with a completed result matching their result header: 306,837.
- Incomplete or unfinished records: 37. No such game is eligible.
- Qualifying games in the decoded prefix: 5,209.
- Selected: first 3,000 distinct qualifying complete games, in export order.
- Selected move-only NDJSON SHA-256: `229cd17f3697f75eecd772c6f75300ad20dc863d37606fd06ce3770a6521ca6f`.

This is a bounded chronological sample, **not** an unbiased population sample and **not** full-database opening-explorer popularity. There is no win-rate or engine-quality inference. A completed source game is required, but only its initial SAN moves and minimal game selection metadata are retained. Names, ratings changes, clocks and analysis annotations are not shipped in the selected source.

An intentionally incomplete zstd frame ends with `premature end` (exit 1). The extractor only accepts that specific decompressor boundary error and still requires a complete matching PGN result for each selected game. Partial tail games are never accepted implicitly at EOF.

The compressed prefix lives only under ignored `data/book-sources/raw/`; it is 100 MB, not a full monthly download. It is optional for ordinary builds. Durable rebuild inputs are the 3,000-record move-only NDJSON, SOURCE receipt and evidence hashes. SOURCE records the compressed hash for independent reacquisition. No runtime network API is used.

## Weighting and legality

Each sampled game contributes one continuation vote at every retained absolute ply. Identical 12-ply SAN paths collapse by adding their **actual game counts**, not by assigning one vote per unique path. The main runtime book has 2,705 unique paths representing exactly 3,000 games; the slow book has 243 paths representing exactly 253 games. Full retained 24-ply source has 2,991 / 253 distinct paths respectively. Transpositions merge board continuations only at the same recorded ply.

`src/book-sources.mjs` exports `validateOpeningBook(payload) -> { maxPlies, positions }`. It bounds the v1 schema, strictly replays all runtime SAN through the existing `compileBook`, then compares every serialized position key and every UCI continuation/weight/ply against replay. Missing, extra, altered, truncated and illegal payloads throw. It accepts the unchanged original ECO payload as well as the new books.

The resulting runtime value is compatible with existing `chooseBookMove`. Pass the original imported FEN directly; do not normalize phantom/non-capturable EP fields before selection. Existing exact-ply, castling/EP identity, terminal and legal-candidate guards remain in force. Callers still own history-sensitive draw guards. Inject `seededRandom(seed)` or another `[0,1)` RNG as before.

## Offline rebuild and tests

```sh
node --max-old-space-size=128 tools/v8-books-build.mjs
python tests/test_v8_books_extract.py
node --max-old-space-size=128 --test --test-concurrency=1 tests/v8-books-*.test.mjs
```

The build verifies the selected-source and primary-evidence hashes before compiling; it writes both runtime books, manifest, full license and `STATS.json`. It does not change ECO and never fetches the network. Tests verify byte-identical rebuilds, exact observed initial-move frequencies, full runtime replay, source/game counts, hashes, full license, malformed/illegal/tampered/truncated data, exact ply/EP misses, transpositions and deterministic/injected RNG.

Verified recovery run: **6 Node tests passed**, plus the Python extractor test. The complete Node receipt run (offline source replay, all three runtime validators and assertions) used 186,784 KiB peak RSS under `--max-old-space-size=128`. With the parallel CPU teacher active, full runtime replay took about 4.03 s for ECO, 6.04 s for the main empirical profile, and 0.62 s for slow. Cache validated books and perform compilation in the worker; do not repeatedly validate on the UI thread. Extraction used 22,076 KiB peak RSS. These are observed local timings, not browser performance promises.

## Bounded reacquisition

The unsafe old `arrayBuffer()` downloader and explorer/authentication code were removed. The replacement streams through backpressure, hashes while writing, refuses anything except an exact HTTP 206 range, rejects truncated/oversized bodies, cleans incomplete transfers, keeps the timeout active through body consumption, and hard-caps a prefix at 200 MB. The previous 1.2 GB command now fails **before any network request**.

```sh
node --max-old-space-size=128 tools/v8-books-fetch.mjs dump --month 2026-09 --bytes 100000000
python tools/v8-books-extract.py \
  data/book-sources/raw/lichess_db_standard_rated_2026-09.pgn.zst.prefix-100000000.part \
  data/book-sources/selected-games.ndjson
```

Check the compressed and selected hashes against SOURCE before adopting reacquired material. Reacquisition writes a separate response metadata receipt next to the raw prefix. `tools/v8-books-receipt.mjs` documents the one-time original receipt assembly from the preserved original HTTP headers; **do not rerun it merely to rebuild books or silently rebaseline SOURCE**. A genuinely changed upstream export is a new corpus requiring a new reviewed receipt.

Use the browser's opening-book source selector, or the laptop CLI's `--book-source eco`, `--book-source lichess-2200` or `--book-source lichess-2200-slow`. The UCI interface exposes `BookSource`. Source identifier, source-file SHA-256 and seed are retained for reproducibility; book selection remains separate from neural inference.
