import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../src/chess.mjs';

const loadEngine = () => import('../src/engine.mjs');

test('canonical encoding preserves files and swaps arbitrary piece colors by rank reflection', async () => {
  const { encodePosition } = await loadEngine();
  const fen = 'r3k2r/1p3ppp/2n5/3q4/2B1P3/3N4/PPP2PPP/R2QK2R w KQkq - 2 12';
  const reflected = fen.split(' ')[0].split('/').reverse().map(row => row.replace(/[a-zA-Z]/g, c => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('/') + ' b KQkq - 2 12';
  assert.deepEqual(encodePosition(fen), encodePosition(reflected));
  const encoded = encodePosition(fen);
  for (let square = 0; square < 64; square++) {
    assert.ok(Array.from({ length: 12 }, (_, plane) => encoded[plane * 64 + square]).reduce((a, b) => a + b, 0) <= 1);
  }
  assert.deepEqual(encodePosition(new Chess().fen()), encodePosition(new Chess().fen().replace(' w ', ' b ')));
});

test('raw board encoding is twelve canonical one-hot planes for either side', async () => {
  const { encodePosition } = await loadEngine();
  const white = encodePosition('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  const black = encodePosition('4k3/4p3/8/8/8/8/8/4K3 b - - 0 1');
  assert.equal(white.length, 768);
  assert.deepEqual(white, black);
  assert.equal(white[12], 1); // own pawn e2; a1=0
  assert.equal(white[5 * 64 + 4], 1);
  assert.equal(white[11 * 64 + 60], 1);
  assert.equal(white.reduce((a, b) => a + b, 0), 3);
});
