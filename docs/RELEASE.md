# Release verification — v0.1.0

Live app: https://clavum-figendi.github.io/astra-chess/

Source tested and deployed: `921ed461b56aa2970b1ee0b76f89b8f1bc73c04c` (`v0.1.0`).
Pages commit: `b7937f04c3fd9227fb63cec8384f93a542810382` (`deploy-20261116-023554`).
GitHub Pages workflow run `43793198863`: success; Pages API status `built`.

## Verified

- Independent spec review and final source quality/security review approved the honestly labelled experimental software. See `REVIEW-SPEC.md` and `REVIEW-FINAL.md`, including their scoped hashes and evidence boundaries.
- Isolated clean source restore with `npm ci --ignore-scripts`, all 34 tests (browser contracts enabled) passing, clean build and extracted laptop UCI execution: `evaluation/release-clean.json`.
- Final delivered ZIP extracted and both actual models executed; numerical binaries checked against manifest: `evaluation/release-delivery.json`.
- Actual hosted-origin Chromium play and worker/Node score parity for both models; colors, underpromotion, castling, en passant, mate termination, PGN export, actual timeout and mobile layout/play: `evaluation/browser-live.json`. No page errors recorded.
- Hosted HTML, both weight files and laptop ZIP returned HTTP 200. Remote binary/ZIP SHA-256 matched local tested artifacts: `evaluation/release-live.json`.
- `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities at publication. This is a registry audit observation, not a security guarantee.

Laptop ZIP: 7,042,014 bytes.
SHA-256: `a89d264c3039f259e5349aa4995c6e6792654340e3581d0a1b740999e48a3ff8`.

This document and hosted verification receipts were recorded after deployment; they do not change the reviewed software or model bytes. The release ZIP contains the pre-publication reports, not this post-publication receipt. ZIP reproducibility is not claimed (timestamps may differ); model/compiler reproducibility is byte-for-byte tested.

## Acceptance boundaries

- Browser app, laptop model/runtime, two real model sizes, authored numerical weights/topology, no training/pretrained policy/tree search, test harness and GitHub Pages deployment: delivered and exercised.
- **Grandmaster strength: not achieved or demonstrated.** Pocket solved 27/256 full puzzle sequences; Atlas 74/256. No Elo assigned.
- **Exclusive Astra authorship: not delivered.** Work is Astra-directed with Sol implementation assistance and an Astra-authored strategic revision; all public identity surfaces disclose this. This departure must not be hidden behind the fact that no pretrained weights were used.
- The models encode selected authored chess heuristics. This is not a learned-model capacity frontier or proof of general intelligence.
- Physical consumer laptop/phone measurements and native Windows/macOS execution were not performed; Linux Node and Chromium desktop/mobile emulation were tested.
