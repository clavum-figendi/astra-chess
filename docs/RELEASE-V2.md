# v0.2.0 release verification

Live app: https://clavum-figendi.github.io/astra-chess/

- Source/tag: `ddb65f3bcd94347a256da7d18767561fb2e3cf70` / `v0.2.0`.
- Pages commit: `cfd0ac600edc0a58f59c79f2ec8cb75645001ac8`.
- Deployment tag: `deploy-20261116-032153`.
- GitHub Pages run `43797798743`: successful; Pages status `built`.

## Verified evidence

- Clean dependency restore, **39 tests passed, zero failed/skipped**, build and isolated extracted UCI execution for all four binaries: `evaluation/v0.2/release-clean.json`.
- Independent spec and circuit/code-quality review passed; its 26 scoped model/source/evidence hashes were rechecked unchanged: `docs/REVIEW-V2.md`.
- Final delivered archive extracted independently, all four model hashes and UCI responses checked, CLI catalogue exposes four actual models plus three explicitly unbuilt proposals: `evaluation/v0.2/release-delivery.json`.
- Actual hosted Chromium worker/Node top-five score parity and real game replies for all four models; Plus mating moves; both colors; promotion, castling, en passant, terminal import, PGN, timeout and mobile layout/play: `evaluation/v0.2/browser-live.json`. No page errors.
- HTTP 200 and SHA-256 equality for all four hosted binaries and the laptop archive, correct deployment identity, public proposal JSON verified: `evaluation/v0.2/release-live.json`.
- `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities before publication; this is not a general security guarantee.

Final laptop ZIP: **15,219,033 bytes**.
SHA-256: `9dbab628be9f3874940e6d717eb119f27ddcbd4e6bf37b5bf52017afc5e00a4f`.

This post-publication receipt is not inside the pre-publication ZIP. A documentation-only evidence commit does not alter the deployed code/weights. ZIP timestamps are not deterministic; numerical model reproduction is tested byte-for-byte. Physical phone/laptop measurements and native Windows/macOS execution are not claimed.

## What the improvement means

Pocket+ is 8.47 MB, Atlas+ 41.07 MB; both are usable in the webapp and laptop runner. Both improve the narrow three-man mate/stalemate diagnostic. Pocket+ also improves fresh-sample puzzle agreement (27 to 36 full matches of 256), but not the small match scores; Atlas+ has unchanged broad puzzle/match results. Therefore originals remain defaults. No general strength upgrade, Elo or grandmaster claim.

The 64–96 MB browser, 128–256 MB laptop and optional 256–512 MB research sizes are **proposals**, not delivered models. They appear separately in both the website and laptop catalogue, with explicit memory assumptions and promotion gates. See `EXPANSION-V2.md` for full positive and negative results.
