import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../src/chess.mjs';
import { encodePosition } from '../src/engine.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseModel, forward } from '../src/network.mjs';

let pocket, atlas;
const compiled = {};
before(async () => {
  const { compileModel } = await import('../tools/compile-models.mjs');
  compiled.pocket = compileModel('pocket');
  compiled.atlas = compileModel('atlas');
  pocket = parseModel(compiled.pocket.buffer);
  atlas = parseModel(compiled.atlas.buffer);
});
const score = (fen, move, model = pocket) => {
  const position = new Chess(fen);
  const index = square => (position.turn() === 'w' ? Number(square[1]) - 1 : 8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
  return forward(model, encodePosition(fen))[(index(move.slice(0, 2)) * 64 + index(move.slice(2, 4))) * 5 + Math.max(0, ' qrbn'.indexOf(move[4] || ' '))];
};

test('Pocket scores free material above quiet play without entering a losing queen exchange', async () => {
  const { chooseMove } = await import('../src/engine.mjs');
  assert.equal(chooseMove('6k1/q7/8/8/8/8/8/R5K1 w - - 0 1', pocket).move, 'a1a7');
  const trap = '6k1/8/3p4/4r3/4Q3/8/8/6K1 w - - 0 1';
  assert.ok(score(trap, 'e4e5') < score(trap, 'e4f4'));
  assert.notEqual(chooseMove(trap, pocket).move, 'e4e5');
});

test('Pocket attack rays respect blockers and the vacating source', () => {
  const blocked = '4r1k1/8/8/4p3/8/8/3Q4/6K1 w - - 0 1';
  const open = '4r1k1/8/8/8/8/8/3Q4/6K1 w - - 0 1';
  assert.ok(score(blocked, 'd2e2') > score(open, 'd2e2') + 7);
  const uncover = '6k1/8/8/8/8/8/8/r2Q2K1 w - - 0 1';
  assert.ok(score(uncover, 'd1e1') < score(uncover, 'd1d2'));
});

test('Atlas adds genuine checking-fork and vacated-shield relationships', () => {
  const fork = '8/8/1q3k2/8/5r2/2N5/8/6K1 w - - 0 1';
  assert.ok(score(fork, 'c3d5', atlas) > score(fork, 'c3d5', pocket) + 0.8);
  // A rook ray with the knight shielding the queen.
  const exposed = '3r2k1/8/8/8/8/8/3N4/3Q2K1 w - - 0 1';
  assert.ok(score(exposed, 'd2f3', atlas) < score(exposed, 'd2f3', pocket) - 4);
  const diagonal = '6kb/8/8/8/3N4/8/8/Q5K1 w - - 0 1';
  assert.ok(score(diagonal, 'd4f5', atlas) < score(diagonal, 'd4f5', pocket) - 4);
  assert.ok(atlas.edgeCount > pocket.edgeCount * 1.2);
});

test('Atlas encodes protected adjacent queen checks without treating king pseudo-attacks as a free capture', async () => {
  const { chooseMove } = await import('../src/engine.mjs');
  const fen = '6k1/8/5K1Q/8/8/8/8/8 w - - 0 1';
  assert.ok(score(fen, 'h6g7', atlas) > score(fen, 'h6g7', pocket) + 1.8);
  assert.equal(chooseMove(fen, atlas).move, 'h6g7');
});

test('en passant capture reward is encoded from raw pawn relationships', () => {
  const ep = '6k1/8/8/3pP3/8/8/8/6K1 w - d6 0 1';
  const empty = '6k1/8/8/4P3/8/8/8/6K1 w - - 0 1';
  assert.ok(score(ep, 'e5d6') > score(empty, 'e5d6') + 0.9);
});

test('authored phase gate activates the king in pawn endings but not against enemy major pieces', () => {
  const ending = '6k1/7p/8/8/8/8/P3K3/8 w - - 0 1';
  const dangerous = 'r5k1/7p/8/8/8/8/P3K3/8 w - - 0 1';
  for (const model of [pocket, atlas]) {
    assert.ok(score(ending, 'e2e3', model) > score(ending, 'e2e1', model) + 0.1);
    assert.ok(score(dangerous, 'e2e3', model) < score(dangerous, 'e2e1', model));
  }
});

test('authored rook-file weights distinguish open, semi-open and own-pawn files', () => {
  const open = '6k1/8/8/8/8/8/PP6/R5K1 w - - 0 1';
  const ownPawn = '6k1/8/8/8/8/8/PP1P4/R5K1 w - - 0 1';
  const enemyPawn = '6k1/3p4/8/8/8/8/PP6/R5K1 w - - 0 1';
  for (const model of [pocket, atlas]) {
    assert.ok(score(open,'a1d1',model) > score(enemyPawn,'a1d1',model) + 0.15);
    assert.ok(score(enemyPawn,'a1d1',model) > score(ownPawn,'a1d1',model) + 0.08);
  }
});

test('both colors promote to a legal queen and castling has encoded value', async () => {
  const { chooseMove } = await import('../src/engine.mjs');
  for (const model of [pocket, atlas]) {
    assert.equal(chooseMove('7k/P7/8/8/8/8/8/6K1 w - - 0 1', model).move, 'a7a8q');
    assert.equal(chooseMove('6k1/8/8/8/8/8/p7/7K b - - 0 1', model).move, 'a2a1q');
    // In a bare-king ending active king moves may outrank castling; the castling
    // preference must still be present rather than force a strategically bad choice.
    assert.ok(score('k7/8/8/8/8/8/8/4K2R w K - 0 1', 'e1g1', model) > 0.2);
  }
});

test('all stored neurons contribute to policy outputs rather than size padding', () => {
  for (const model of [pocket, atlas]) {
    const seen = new Uint8Array(model.nodeCount);
    const stack = [...new Set(model.outputs)];
    while (stack.length) {
      const n = stack.pop() - model.inputCount;
      if (n < 0 || seen[n]) continue;
      seen[n] = 1;
      for (let e = model.rowPtr[n]; e < model.rowPtr[n + 1]; e++) stack.push(model.sources[e]);
    }
    assert.equal(seen.reduce((a, b) => a + b, 0), model.nodeCount);
  }
});

test('downloaded artifacts reproduce byte-for-byte, with topology-inclusive manifest accounting', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/models/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.models.length, 2);
  for (const model of [pocket, atlas]) {
    const entry = manifest.models.find(m => m.id === model.metadata.id);
    const bytes = readFileSync(new URL(`../public/models/${entry.file}`, import.meta.url));
    assert.deepEqual(bytes, Buffer.from(compiled[entry.id]));
    assert.equal(entry.bytes, bytes.length);
    assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(entry.parameters, model.nodeCount + model.edgeCount);
    assert.equal(entry.neurons, model.nodeCount);
    assert.equal(entry.bytes, entry.topologyBytes + entry.tensorBytes + entry.headerMetadataBytes);
  }
});

test('legal mask, black perspective and deterministic candidate ordering are preserved', async () => {
  const { chooseMove } = await import('../src/engine.mjs');
  const fen = 'r5k1/8/8/8/8/8/Q7/6K1 b - - 0 1';
  const result = chooseMove(fen, pocket);
  assert.equal(result.move, 'a8a2');
  const legal = new Set(new Chess(fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')));
  assert.ok(result.candidates.length <= 5);
  assert.ok(result.candidates.every(c => legal.has(c.move) && Number.isFinite(c.score)));
  assert.deepEqual(result.candidates, [...result.candidates].sort((a, b) => b.score - a.score || (a.move < b.move ? -1 : a.move > b.move ? 1 : 0)));
  assert.deepEqual(chooseMove(fen, pocket).candidates, result.candidates);
  assert.ok(result.elapsedMs >= 0);
  assert.equal(chooseMove('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', pocket).move, null);
});
