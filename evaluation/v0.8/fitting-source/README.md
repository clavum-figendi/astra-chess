# Original fitting sources and post-fit exposure guards

These `.txt` copies preserve the exact fitting programs used to generate the development evidence and candidate bytes. Historical reports retain their original source hashes; they were not rebound to later code.

| Original program | Archived SHA-256 | Guarded current-program SHA-256 |
|---|---|---|
| `spikes/weight-repair-v8/run.py` | `e727073b530f1b182a9c4b513e5f7d5fe2b78fe540b53cc614e53868ee704735` | `894b6c6fbbb19d5bb6cf68b4983d731d0ba85a5ff3532b752d76dbd146ecf622` |
| `tools/v8-weights-sparse.mjs` | `7110870c46fcfac2dc5e4278bf30ffa21f45a754e710e042056089dd2801f71a` | `ca7e4b270c11d06181d90ba10d23c74bc6fb7270ea91870841366d3489b84b10` |

Before fresh selection/final-test exposure, the current programs gained fail-closed checks for `.cache/v8/selection.json` or `test-exposed.json`. The Python direct fitting functions and CLI, and the Node cache/export CLI, reject before model loading or output creation. No numeric fitting operations changed and no candidate was regenerated. `tests/test_v8_selection.py` observed the missing-guard failure, then passed the integration regression after this patch. All eight recorded checkpoint/binary candidate digests still match their original manifest.

The archived text is evidence, not an alternative executable fitting entrypoint. The new selector independently evaluates actual frozen artifacts and binds its own inference sources.
