import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../../src/chess.mjs';
import { ACTION_TO_MOVE, encodeStateActions, expectedValues, MOVE_TO_ACTION, rankCandidates, tokenizeFen } from '../../src/transformer.mjs';

test('tokenizes official 77-character FEN contract', () => {
  assert.deepEqual(tokenizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').slice(0, 4), [29, 20, 19, 11]);
  assert.equal(tokenizeFen('6k1/8/8/3pP3/8/8/8/6K1 w - d6 0 1').length, 77);
});

test('accepts every promotion, castling, and en-passant move in both colors', () => {
  const positions = [
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1',
    '8/Pk6/8/8/8/8/6Kp/8 w - - 0 1',
    '8/Pk6/8/8/8/8/6Kp/8 b - - 0 1',
    '6k1/8/8/3pP3/8/8/8/6K1 w - d6 0 1',
    '6k1/8/8/8/3Pp3/8/8/6K1 b - d3 0 1',
    'k7/8/8/8/8/8/8/K6R w - - 0 1',
    'k7/8/8/8/8/8/8/r6K b - - 0 1',
  ];
  for (const fen of positions) {
    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true }).map((move) => move.from + move.to + (move.promotion || ''));
    const tokens = encodeStateActions(fen, legal);
    assert.equal(tokens.length, legal.length * 79);
    assert.ok(legal.every((move) => MOVE_TO_ACTION.has(move)), `${fen}: missing action for legal moves`);
  }
});

test('matches generated action contract exactly', () => {
  assert.equal(ACTION_TO_MOVE.length, 1968);
  assert.equal(MOVE_TO_ACTION.size, 1968);
  assert.equal(MOVE_TO_ACTION.get('a1h8'), 20);
  assert.equal(ACTION_TO_MOVE[20], 'a1h8');
  assert.equal(MOVE_TO_ACTION.get('a1a8'), 19);
  assert.equal(MOVE_TO_ACTION.get('e2e1q'), 1836);
  assert.equal(ACTION_TO_MOVE[1836], 'e2e1q');
});

test('computes bucket expected returns with softmax centers', () => {
  const uniform = new Float32Array(128);
  assert.ok(Math.abs(expectedValues(uniform)[0] - 0.5) < 1e-12);
  const last = new Float32Array(128);
  last[127] = 100;
  assert.ok(Math.abs(expectedValues(last)[0] - 127.5 / 128) < 1e-12);
});

test('ranks candidates by value then UCI string', () => {
  const ranked = rankCandidates(['b2b1', 'a1a2'], [0.5, 0.5]);
  assert.deepEqual(ranked, [{ move: 'a1a2', score: 0.5 }, { move: 'b2b1', score: 0.5 }]);
});
