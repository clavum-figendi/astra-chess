# Chess Lab v0.4.0 release

- Live app: https://clavum-figendi.github.io/astra-chess/
- Source/tag: `3d21e280f92fcf0608c77746febf78eb434dd079` / `v0.4.0`.
- Pages commit: `36c7d26e3a47ce4776568b79798a43396a98c2f3`.
- Deployment tag: `deploy-20261116-151003`.
- Successful Pages workflow: `43893507684`.

## Changes

Chess Lab branding replaces agent-name presentation in the player/UCI/current README/catalogue. A default-on weighted opening book provides 42 branches and 340 exact positions through 12 plies, with fresh seeds, fixed-seed replay, book-off mode and PGN provenance. Current URLs and historical evidence remain compatible.

Two additional binaries, Pocket Policy and Atlas Policy, use genuine Stockfish depth-6 bestmove/MultiPV-rank supervision and 1,031/1,965 free geometry-specific coefficient groups. The fitting objective is 75% hard chosen move plus 25% ranked policy, not score regression. The fitted artifacts are exact reproducible binary rewrites, not runtime overlays. All eight models are available in browser and laptop players.

## Verification

- 80 local tests passed, no failures/skips, including real engines and browser contracts.
- Independent core review passed. Its scoped hashes and the explicitly reviewed build-version delta were verified unchanged.
- Clean dependency restoration separately ran 80 tests: 75 passed and five real-engine tests explicitly skipped because development executables are absent from the clean package. Build and extracted eight-model execution passed; counts from these contexts are not added together.
- Final delivered ZIP was extracted after documentation/evidence repacking. Every model hash and the exact opening-book bytes were checked. All eight models executed UCI with book on and off, fixed seed, and a noninitial position; source fields distinguished book/policy correctly.
- Hosted Chromium verified all eight actual-weight worker/Node rankings, real game replies, seeded book parity and variety, both colours, six Plus/Tuned/Policy mating choices, promotion, castling, en passant, terminal imports, PGN, timeouts and mobile play. No page errors.
- HTTP downloads matched all eight model hashes, the book hash and final ZIP digest; deployment metadata identified v0.4.0. Receipts are `evaluation/v0.4/browser-live.json` and `release-live.json`.
- All 96 evaluation PGNs were replayed and 2,618 recorded model decisions matched histories. Fitting after test exposure was explicitly attempted and rejected without changing frozen selection.

Final ZIP: **32,823,165 bytes**.
SHA-256: `da8a7f76c0ad606057eca3161a34f607e69c7134def9bf829a6c24a232fd8005`.

This post-publication record and live receipts are on the source branch, outside the already verified ZIP. No cloud jobs or charges occurred. Local fitting was sufficient for this coefficient-level experiment.

## Measured outcome

The new direct-policy fit lowered validation cross-entropy but did not improve held-out top-1 over Plus parents: Pocket Policy 21.38% versus Pocket+ 21.38%; Atlas Policy 22.64% versus Atlas+ 23.27%, over 159 positions. Mean teacher ranks regressed. Existing model defaults remain unchanged.

The 96 neural-only engine games produced 0 wins, 91 checkmate losses, 1 repetition draw and 4 unresolved caps. The opening book improves variety, not the reported neural-only strength. Full settings and results are in [POLICY-V4.md](POLICY-V4.md).
