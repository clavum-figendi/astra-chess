# Policy fitting tools (development only)

These modules fit numerical terminal-head weights to Stockfish best moves and
MultiPV ranks. They do not change the generic graph runtime, network ABI, hidden
graph, or deployed artifacts. No runtime chess heuristic or new graph node is
added. The v3 tools and artifacts remain the audit baseline.

## Weight/cache API — `tools/policy-tuning.mjs`

### `createPolicyState(bytes)`

Accepts binary bytes (Buffer, Uint8Array, or ArrayBuffer). Returns copied base
`bytes`, parsed `model`, `baseSHA256`, eligible `heads`, `canonicalOutputs` (output
ID → lowest output index), `edgeGroups` (Int32Array, -1 for untouched edges), and
`groups: [{key, lower, upper, fixed, edges}]`.

Only affine output nodes that are not used as any other node's source are
eligible. Shared output IDs use the lowest output index, not whichever legal
move happened to be encountered. Decode that index as:

```
promotion = outputIndex % 5                 // none, q, r, b, n
from = floor(outputIndex / 320)
to = floor(outputIndex / 5) % 64
```

Free groups refine v3 source/weight categories by:

- Knight-displacement geometry, or straight/lateral displacement plus signed
  rank direction (left/right mirrored together).
- Destination outer files a/b/g/h versus center files c/d/e/f, crossed with
  home/away rank halves in the existing side-to-move canonical coordinates.
- Promotion index.

This yields **1,031 free / 1,038 total groups for Pocket+**, and **1,965 free /
1,972 total for Atlas+**, versus 64/82 free v3 groups. Every group owns actual
edges; no zero-only free group or parameter padding is added. These are extra
independent numerical degrees of freedom, not newly learned hidden features.
Different geometries can now adjust formerly tied terminal coefficients
independently. Backbone expressivity is still inherited from the authored graph.

Protected capture-plane sources 384–703 and absolute weights ≥50 (including
terminal-100 edges) remain fixed at scale 1; all other bounds are [0.05, 4].
Hidden/nonhead edges, biases, graph structure, and output mappings are untouched.

### `legalPolicyFeatures(fen, state)`

Returns lexically sorted legal `{move, indices, values, fixed}` rows. `move` is UCI
including promotion suffix. Sparse indices are unique, ascending, and omit zero
values. Protected contributions are folded into `fixed`. The unchanged network
is traced **once per position**, not once per legal move. Insufficient-material
and fifty-move draw positions return `[]`, matching the existing cache convention.

```
logit(move) = fixed + sum(values[k] * scales[indices[k]])
```

This is exact in unrounded real arithmetic because all fitted heads are terminal
affine nodes. Serialization rounds individual coefficients to float32; parity
tests compare with a 2e-5 absolute tolerance on tested positions, not a universal
error bound. Never reuse a cache with a different base SHA/grouping.

### `rewritePolicyWeights(state, scales, metadata = {})`

Validates length, finite scale values, and group bounds, then returns a complete
Uint8Array binary with aligned metadata and updated CRC. It never mutates source
bytes. Model metadata is merged with supplied metadata, followed by mandatory
neutral provenance: `trained:true`, `policyDistilled:true`, `engineTuned:true`,
`authored:false`, `authoredBackbone:true`, `search:false`, pinned `baseSHA256`, and
a neutral `authorship` string. Supply the new model `id` and `name` explicitly.

## Fitting API — `tools/policy-optimizer.mjs`

### Rows

```js
{
  id: 'stable-board-id',
  fen: '...',
  bestmove: 'e2e4',                       // actual Stockfish bestmove
  moves: [{
    move: 'e2e4', indices: [0, 12], values: [0.25, -0.5], fixed: 0,
    rank: 1,                            // actual same-iteration MultiPV rank
    cp: 27,                             // optional reporting only
    // mate: 3                          // optional finite reporting field
  }]
}
```

Use fresh, complete same-depth MultiPV labels for production, joined onto the
legal sparse features by exact UCI string. Best move must be legal, present, and
rank 1. Every supplied move must be legal; ranks must be unique positive integers
not exceeding the position's legal-move count. Sparse indices must be unique
integers within the scale vector, arrays must match in length, and all numerical
values must be finite. Sparse zero values are allowed from external caches.
Partial move sets are accepted, with policy normalized over supplied moves;
production callers should supply **all legal moves**.

IDs and canonical FEN first-four-field board identities must be unique within a
split and disjoint between train and validation (clock-only changes do not evade
this check). Final test data must never enter fitting, checkpoint selection, or
hyperparameter adjustment.

### Objective

For each position, target mass is:

```
q(move) = 0.75 * [move == bestmove]
        + 0.25 * exp(-(rank(move)-1)) / sum_moves exp(-(rank(move)-1))
```

Fit mean cross entropy against the softmax of raw network logits using stable
log-sum-exp. **CP and mate magnitudes never enter the target, gradient, or model
selection.** CP is only an auxiliary selected-move report. Gradient accumulation
is sparse O(nonzero features); bounded Adam updates cost O(groups). Rows have equal
weight. Full-batch execution is deterministic and uses no random seed.

### `measurePolicy(rows, scales)`

Validates inputs and returns:

```
{count, crossEntropy, top1, meanTeacherRank, meanSelectedCP}
```

Top-1 uses lexical UCI tie-breaking. `meanSelectedCP` averages only selected moves
with CP values and is null if none have CP; mate is validated but not converted
to a surrogate. Bounds require group information and are enforced by fitting and
serialization, not this measurement function.

### `fitPolicy({groups, train, validation}, options = {})`

Options (unknown fields have no effect):

| Option | Default | Accepted range |
|---|---:|---|
| `rounds` | 6 | integer 1–6 |
| `epochs` | 150 | integer 1–150 **per round** |
| `patience` | 2 | integer 1–2 non-improving rounds |
| `learningRate` | 0.03 | finite (0, 1] |
| `onRound` | absent | synchronous function(record) |

Adam uses beta1=0.9, beta2=0.999, epsilon=1e-8, bias correction, and projection
onto each group's bounds after every update. Fixed groups remain exactly 1.
Validation runs after every round. The cold all-ones base is included as the
initial best candidate; fitting may legitimately return unchanged base weights.
Selection minimizes validation cross entropy, breaking ties within 1e-12 by
higher validation top1. It never selects using CP or training metrics.

Return shape:

```js
{
  baseline: {train: metrics, validation: metrics},
  history: [{round, epochs, scales, metrics: {train, validation}, selected}],
  scales,                             // selected checkpoint, possibly cold base
  metrics: {train, validation}         // selected checkpoint metrics
}
```

History `epochs` is cumulative. `onRound` receives a detached copy of that
round's record, including its scales (not necessarily the selected best scales).
Persist this record for auditable checkpoint receipts. Awaiting asynchronous
callbacks is **not** supported. Caller-owned arrays are not mutated. No data or
checkpoint files are written by these numerical modules.

## Minimal orchestration

```js
import {readFileSync, writeFileSync} from 'node:fs';
import {createPolicyState, legalPolicyFeatures, rewritePolicyWeights}
  from './tools/policy-tuning.mjs';
import {fitPolicy} from './tools/policy-optimizer.mjs';

const state = createPolicyState(readFileSync('public/models/pocket-plus.bin'));
const join = teacherRows => teacherRows.map(r => {
  const labels = new Map(r.moves.map(m => [m.move, m]));
  return {...r, moves: legalPolicyFeatures(r.fen, state).map(f => {
    const label = labels.get(f.move);
    if (!label) throw new Error(`Missing teacher label: ${f.move}`);
    return {...f, rank: label.rank, cp: label.cp, mate: label.mate};
  })};
});
// trainLabels/validationLabels must be fresh, genuine MultiPV records.
const result = fitPolicy({groups: state.groups,
  train: join(trainLabels), validation: join(validationLabels)});
writeFileSync('policy-fit.bin', rewritePolicyWeights(state, result.scales,
  {id: 'pocket-policy', name: 'Pocket Policy'}));
```

## Verification

Run from repository root:

```
node --test tests/policy-tuning.test.mjs tests/policy-optimizer.test.mjs
```

Tests cover deterministic capacity, both-color/promotion float32 inference parity,
shared-head canonical grouping, internally used output exclusion, protected
weights/backbone, invalid inputs/leakage, cold baseline/patience, direct
bestmove-versus-contrary-CP fitting, CP invariance, and the exact rank mixture.
An explicitly named **SMOKE ONLY** test exercises two v3 train and two validation
positions for two epochs; old scalar scores are sorted solely to provide
synthetic smoke labels. This adapter exists only inside the test and is not
production policy supervision or evidence of chess improvement. No final test
split is read, and no production-length training is run by this implementation.
