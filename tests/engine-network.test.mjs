import test from 'node:test';
import assert from 'node:assert/strict';

test('move selection is only network logits plus a legal mask, including lexical ties', async () => {
  const { encodeModel } = await import('../tools/compile-models.mjs');
  const { parseModel } = await import('../src/network.mjs');
  const { chooseMove } = await import('../src/engine.mjs');
  const { Chess } = await import('../src/chess.mjs');
  const outputs = Array(20480).fill(768);
  const model = () => parseModel(encodeModel({
    inputCount: 768, nodes: [{ bias: 0, activation: 0, edges: [] }, { bias: 10, activation: 0, edges: [] }],
    outputs, metadata: { id: 'policy-fixture' },
  }).buffer);
  assert.equal(chooseMove(new Chess().fen(), model()).move, 'a2a3');
  outputs[(12 * 64 + 28) * 5] = 769; // e2e4
  assert.equal(chooseMove(new Chess().fen(), model()).move, 'e2e4');
  outputs[(0 * 64 + 63) * 5] = 769; // a1h8 is illegal; it cannot win.
  assert.equal(chooseMove(new Chess().fen(), model()).move, 'e2e4');
});

test('parser rejects cycles, invalid sparse rows, nonfinite tensors and invalid outputs', async () => {
  const { encodeModel } = await import('../tools/compile-models.mjs');
  const { parseModel, checksum } = await import('../src/network.mjs');
  const fixture = (node, outputs = [2]) => encodeModel({ inputCount: 2, nodes: [node], outputs, metadata: {} }).buffer;
  assert.throws(() => parseModel(fixture({ bias: 0, activation: 1, edges: [[2, 1]] })), /feed-forward/i);
  assert.throws(() => parseModel(fixture({ bias: Infinity, activation: 1, edges: [] })), /coefficient/i);
  assert.throws(() => parseModel(fixture({ bias: 0, activation: 1, edges: [[0, NaN]] })), /finite/i);
  assert.throws(() => parseModel(fixture({ bias: 0, activation: 2, edges: [] })), /activation/i);
  assert.throws(() => parseModel(fixture({ bias: 0, activation: 0, edges: [] }, [99])), /output/i);
  const badRows = fixture({ bias: 0, activation: 1, edges: [[0, 1]] });
  const view = new DataView(badRows);
  view.setUint32(44, 1, true); // metadata {} padded to four bytes, rowPtr[0]
  view.setUint32(36, checksum(new Uint8Array(badRows, 40)), true);
  assert.throws(() => parseModel(badRows), /row/i);
  const version = fixture({ bias: 0, activation: 0, edges: [] });
  new DataView(version).setUint32(8, 99, true);
  assert.throws(() => parseModel(version), /version/i);
});

// Deliberately not chess: inference must execute arbitrary affine/ReLU graphs.
test('binary network executes affine and ReLU nodes, retaining signed outputs', async () => {
  const { encodeModel } = await import('../tools/compile-models.mjs');
  const { parseModel, forward } = await import('../src/network.mjs');
  const bytes = encodeModel({
    inputCount: 2,
    nodes: [
      { bias: -1, activation: 1, edges: [[0, 2], [1, -3]] },
      { bias: -4, activation: 0, edges: [[2, 0.5]] },
    ],
    outputs: [2, 3], metadata: { id: 'arithmetic-fixture' },
  });
  const model = parseModel(bytes.buffer);
  assert.deepEqual([...forward(model, new Float32Array([3, 1]))], [2, -3]);
  assert.deepEqual([...forward(model, new Float32Array([0, 1]))], [0, -4]);
  assert.equal(model.metadata.id, 'arithmetic-fixture');
  assert.throws(() => forward(model, [1]), /input/i);
  assert.throws(() => forward(model, [NaN, 1]), /finite/i);
  assert.throws(() => parseModel(bytes.buffer.slice(0, -1)), /length|truncat/i);
  const corrupt = bytes.slice();
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => parseModel(corrupt.buffer), /checksum/i);
});
