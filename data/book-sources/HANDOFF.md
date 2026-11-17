# Book worker handoff

READY: `public/books/manifest.json` (version 1/default eco) and `src/book-sources.mjs` (`validateOpeningBook(payload)` returns `{maxPlies,positions}`). Files resolve relative to the manifest. New playable IDs: `lichess-2200` and `lichess-2200-slow`. ECO is unchanged/default. Masters is honestly unavailable in the manifest, with original anonymous 401 receipts; no explorer retries or credentials.

Actual official CC0 export sample: 100,000,000 compressed bytes from 2026-09, SHA-256 in SOURCE. Streaming decoded 306,874 records / 5,209 qualifying complete games, selected first 3,000 distinct qualifying games (both ratings >=2200). Speeds: 2,747 blitz, 244 rapid, 9 classical; slow profile is exactly 253 rapid/classical games from that SAME corpus. Raw selected SAN retains <=24 plies and all are strictly replayed by offline build. Runtime snapshots stop at 12 plies to bound validation and total 1,540,282 bytes/12,332 positions and 182,086 bytes/1,556 positions. Actual game-frequency weights preserved, including duplicate path counts.

Ready source/assets/docs:
- tools/v8-books-{fetch,build,receipt}.mjs; tools/v8-books-extract.py
- src/book-sources.mjs
- public/books/{manifest.json,lichess-2200.json,lichess-2200-slow.json,CC0-1.0.txt}
- data/book-sources/{SOURCE.json,STATS.json,selected-games.ndjson,selected-games.meta.json,evidence/*,probes/*}
- docs/BOOK-SOURCES-V8.md
- newtests/v8-books-{build,fetch,snapshots,validator}.test.mjs and newtests/v8-books-extract.test.py

Verified: 6 Node tests + Python extractor test passed, including full strict runtime validation for ECO and both new books, source checksums, license, observed initial-move frequencies, exact byte-identical offline rebuild, malformed/illegal/truncated/tampered input, exact ply/EP, transpositions, seeded and injected RNG. Full test run peak RSS 186,784 KiB under max-old-space-size=128. Source extractor peak RSS 22,076 KiB. Worker-side strict replay observed ~6.04s main, ~0.62s slow while CPU teacher runs; cache validated books, avoid UI-thread validation. Full license is shipped byte-for-byte.

Commands:
```
node --max-old-space-size=128 tools/v8-books-build.mjs
python newtests/v8-books-extract.test.py
node --max-old-space-size=128 --test --test-concurrency=1 newtests/v8-books-*.test.mjs
```

Unsafe 1.2GB arrayBuffer downloader replaced entirely by backpressured byte-capped streaming with full-body timeout, exact 206/range verification and cleanup. Hard cap 200MB; oversized request rejected before network. Tested real replacement fetch against a 1MB official range and compared hash with first 1MB of original 100MB acquisition: equal (`31b097f05662321f6492a12e9c5db9651fb93172b2ac3fec88a2aa07f2acff58`). No full database download. Ignored raw storage ~101MB, not needed for ordinary offline rebuilds. Receipt assembler is one-time acquisition provenance, NOT part of normal rebuild; never silently rebaseline SOURCE.

No commit/push. No UI/worker/build/CLI files touched; parent owns wiring. All deliverable edits now stay within the assigned tools/src/newtests/public/data/docs patterns.
