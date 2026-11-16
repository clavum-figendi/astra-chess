# V7 play-first UI verification

## Scope and result

The resumed UI passes its focused Node tests and the complete `tools/browser-v7-ui.py` Chromium journey. The board, clocks, opponent/setup controls and notation remain primary. Technical diagnostics, FEN import, model downloads and reference material sit inside the initially closed native `#technical-panel` disclosure; existing element IDs remain intact. Premoves default on. Sound defaults off and only an explicit on/off preference is persisted.

One genuine defect was found and fixed during this pass: after an illegal premove was discarded, its blue board highlights survived because the opponent's board render preceded queue consumption. A new browser assertion failed with `discarded premove must clear board highlights`; `takeTurn()` now redraws after rejecting an existing queue. The same assertion passes in the final complete run. No model, book, worker or build source was changed by this UI pass.

## Commands and evidence

Run from the repository root:

```sh
node --test tests/v7-ui-premove.test.mjs tests/v7-ui-surface.test.mjs
python tools/browser-v7-ui.py
git diff --check -- public/app.mjs public/index.html public/style.css src/premove.mjs src/sound.mjs tests/v7-ui-premove.test.mjs tests/v7-ui-surface.test.mjs tools/browser-v7-ui.py
```

Final results: **4 Node tests passed**, zero failures/cancellations/skips; browser command exited **0**, no page errors; scoped diff whitespace check exited **0**. Persisted local evidence:

- `.cache/v7-ui-evidence/node-tests.log`
- `.cache/v7-ui-evidence/browser.log`
- `.cache/v7-ui-evidence/receipt.json`
- `.cache/v7-ui-evidence/desktop-queued.png` — desktop queued `g1 → f3`, two highlighted squares, only the human's `e4` committed.
- `.cache/v7-ui-evidence/mobile-390.png` — 390px mobile layout with technical content collapsed.
- `.cache/v7-ui-evidence/desktop.png` — actual DeepMind 9M game, Black orientation, notation `1. e4 Nf6` after the queued black reply.

Screenshots were visually inspected for board/piece legibility, clock visibility, control layout and the queued-move treatment. These are local cache artifacts, not a deployed-site or archive certificate.

## Exact behavioral checks

- Technical content is hidden initially; keyboard Enter opens/closes its native disclosure. Premoves are checked and sound unchecked. No AudioContext is created by default.
- A queued `Nf3` does **not** execute before the delayed legal opponent reply. After `e4 e5 Nf3`, notation contains exactly three plies and queue highlights disappear.
- Controlled monotonic-time assertions preserve normal clock accounting: White displays `3:04`, Black `3:01`; each completed move receives its increment once.
- Escape, right-click, Cancel premove and disabling premoves clear the queue and prevent execution.
- An illegal queued knight destination is rechecked against the resulting legal position, discarded, and removes highlights without adding an increment. White remains `3:02`.
- Model/color changes and New game cancel queued actions and stale delayed worker replies.
- Flag fall preempts the queue: only the original human move is committed, the late worker reply is ignored, and queue highlights clear.
- A queued pawn promotion becomes a queen only after the opponent reply. Ordinary promotion still offers the four choices; selecting a knight in the test position produces an insufficient-material draw.
- Opponent checkmate ends the game before the queued `Nc3` can execute.
- Optional procedural WebAudio produces an actual analyser peak of **0.1115514263510704**, above the `0.001` signal threshold. The probe is a parallel silent analyser branch and leaves the app's original destination connection intact. Muting yields a peak below `0.001`; on/off preference survives reloads, no context is created on reload until a gesture, and enabling sound does not reset the game.
- At viewport widths **320, 390, 768 and 1280**, there is no horizontal overflow and every visible tested non-board button/select/summary/toggle target is at least **44px** high. Board widths are respectively **296, 366, 386 and 664px**. Board squares are deliberately exempt from the 44px non-board target assertion on narrow phones.
- With worker interception removed and opening book disabled, the actual 9M model plays `e4`; queued Black `Nf6` then executes. Worker source is **policy**, reported inference latency in the final run is **3291.60 ms**. This is a single functional inference observation, not a performance benchmark. The next inference is cancelled by changing the model before closing the browser.

## Source binding and release boundary

The runner hardlinks the existing `dist` into `.cache/v7-ui-preview`, unlinks and replaces only preview copies of current UI/worker/source files, and serves that isolated snapshot on `127.0.0.1:4198`. It does not build or modify shared `dist`. The final run asserted identical before/after UI source hashes (`sourceDrift: false`). Fixture replies are used for controlled races, clocks and terminal cases; only the final real-model check is evidence of actual policy inference.

SHA-256 values from the final receipt:

| Input | SHA-256 |
| --- | --- |
| `public/index.html` | `f84c48d6bf647bc1cfdc669eb55b44ef9bf58309219e04f69de5221ff4cec675` |
| `public/style.css` | `f702029c951934e481a5c8f8648b9fba286f62dd66d760528b97f4e3ef88c41a` |
| `public/app.mjs` | `e8562e57bfcdb189080c467db21e1a4f3fa09c274d6befd874b8fc2264a82625` |
| `src/premove.mjs` | `2544bd78176f6b1192646e6eff0b59ec7b5c73988d4fba7ff746e2315bf0fdc8` |
| `src/sound.mjs` | `aef70e82fbd96404fd689d586f0a177ae8309b925b5b0f57aa389fbd37a85c65` |
| `src/clock.mjs` | `19355b93e1394a13d55c9a39d8d4a12c78093826b35edf862de7fc0c2128d6b0` |
| `tools/browser-v7-ui.py` | `6f42568fd29297267fedd65eb59807fd03344c3508f82ffaebeac06d87066154` |
| Preview `models/manifest.json` | `6178a79d9d210822182caab3e44a2a3c7f8cc046d2c0c652bb0fe71e652a4741` |
| Preview `worker.mjs` | `8da5554a89d2e50e4787f8874e03e4cb5fa29bfedfcc6c69bd5238e029e16819` |

The preview still uses the pre-existing nine-model dist manifest, not the parent's forthcoming three-model release build. The actual opening-book expansion is independently owned and is not certified by this UI journey. Final model selection, rebuilt deployment files, download links, book integration and deployed-site smoke checks remain release-owner gates. Automated mobile checks are Chromium viewport checks, not physical iOS/Android audio or assistive-technology certification.
