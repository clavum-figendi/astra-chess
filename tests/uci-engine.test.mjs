import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { Chess } from '../src/chess.mjs';

const fixture = new URL('./fixtures/uci-peer.mjs', import.meta.url).pathname;
async function openFixture(mode, timeoutMs = 1500) {
  const { openEngine } = await import('../tools/uci-engine.mjs');
  process.env.UCI_FIXTURE_MODE = mode;
  try { return await openEngine({ kind: 'stockfish', path: fixture, timeoutMs }); }
  finally { delete process.env.UCI_FIXTURE_MODE; }
}

test('FIXTURE: uses latest complete same-depth MultiPV, not mixed iterations/bounds', async () => {
  const engine = await openFixture('partial');
  try {
    const result = await engine.analyze(new Chess().fen(), { depth: 4, multiPV: 2 });
    assert.equal(result.complete, true);
    assert.deepEqual(result.lines.map(line => [line.move, line.depth, line.cp, line.mate]), [
      ['e2e4', 3, 23, undefined], ['d2d4', 3, undefined, -3],
    ]);
  } finally { await engine.close(); }
});

test('REAL Stockfish: all legal moves scored at one complete depth-4 iteration', { timeout: 20000 }, async t => {
  try { await access(local('stockfish'), constants.X_OK); }
  catch { t.skip(`Real stockfish executable unavailable: ${local('stockfish')}`); return; }
  const { openEngine } = await import('../tools/uci-engine.mjs');
  const engine = await openEngine({ kind: 'stockfish' });
  try {
    const game = new Chess();
    const legal = game.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')).sort();
    const result = await engine.analyze(game.fen(), { depth: 4, multiPV: legal.length });
    assert.equal(result.complete, true);
    assert.equal(result.depth, 4);
    assert.deepEqual(result.lines.map(line => line.move).sort(), legal);
    for (const line of result.lines) {
      assert.equal(line.depth, 4);
      assert.ok(Number.isFinite(line.cp) || Number.isFinite(line.mate));
      assert.equal(line.bound, undefined);
    }
    console.log(JSON.stringify({ receipt: 'stockfish-multipv', depth: result.depth, lines: result.lines.length, bestmove: result.bestmove }));
    const midgame = position();
    const midLegal = midgame.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')).sort();
    const afterHistory = await engine.analyze(midgame.fen(), { depth: 6, multiPV: midLegal.length, moves: history });
    assert.equal(afterHistory.complete, true);
    assert.equal(afterHistory.depth, 6);
    assert.deepEqual(afterHistory.lines.map(line => line.move).sort(), midLegal);
    assert.ok(afterHistory.lines.every(line => line.depth === 6 && (Number.isFinite(line.cp) || Number.isFinite(line.mate)) && !line.bound));
    const single = await engine.analyze(new Chess().fen(), { depth: 2 });
    assert.equal(single.lines.length, 1);
    console.log(JSON.stringify({ receipt: 'stockfish-history-multipv', depth: afterHistory.depth, lines: afterHistory.lines.length, bestmove: afterHistory.bestmove }));
  } finally { await engine.close(); }
});

const local = kind => process.env[kind === 'stockfish' ? 'STOCKFISH_PATH' : 'GNUCHESS_PATH'] || new URL(`../.cache/engines/root/usr/games/${kind}`, import.meta.url).pathname;
const history = ['e2e4', 'e7e5', 'g1f3'];
const position = () => { const game = new Chess(); for (const move of history) game.move(move); return game; };

test('FIXTURE: malformed or missing scores are never fabricated', async () => {
  const engine = await openFixture('missing');
  try {
    const result = await engine.analyze(new Chess().fen(), { depth: 4 });
    assert.equal(result.complete, false);
    assert.equal(result.lines[0].cp, undefined);
    assert.equal(result.lines[0].mate, undefined);
    assert.equal(result.lines[0].move, 'e2e4');
  } finally { await engine.close(); }
});

test('FIXTURE: unexpected exit and illegal/null moves reject without fallback', async () => {
  for (const mode of ['exit', 'illegal', 'null']) {
    const engine = await openFixture(mode);
    try {
      await assert.rejects(engine.analyze(new Chess().fen(), { depth: 1 }), mode === 'exit' ? /exited.*7.*fixture deliberate exit/ : /illegal\/null/);
    } finally { await engine.close(); }
  }
});

test('FIXTURE: timeout poisons session and bounds stderr', async () => {
  const engine = await openFixture('timeout', 300);
  try {
    await assert.rejects(engine.analyze(new Chess().fen(), { depth: 1 }), error => {
      assert.match(error.message, /timeout.*bestmove/);
      assert.ok(error.message.length < 9000);
      return true;
    });
    await assert.rejects(engine.analyze(new Chess().fen()), /timeout/);
  } finally { await engine.close(); await engine.close(); }
});

test('FIXTURE: concurrent analysis is rejected, later sequential analysis works', async () => {
  const engine = await openFixture('slow');
  try {
    const first = engine.analyze(new Chess().fen(), { depth: 3 });
    await assert.rejects(engine.analyze(new Chess().fen()), /Concurrent/);
    assert.equal((await first).bestmove, 'e2e4');
    assert.equal((await engine.analyze(new Chess().fen())).bestmove, 'e2e4');
  } finally { await engine.close(); }
  await assert.rejects(engine.analyze(new Chess().fen()), /closed/);
});

test('FIXTURE: validates FEN, limits and complete standard-start history before sending', async () => {
  const engine = await openFixture('partial');
  try {
    for (const [fen, options, pattern] of [
      [new Chess().fen() + '\nquit', {}, /Unsafe FEN/],
      [new Chess().fen(), { depth: '4\nquit' }, /Invalid depth/],
      [new Chess().fen(), { nodes: 0 }, /Invalid nodes/],
      [new Chess().fen(), { multiPV: 257 }, /Invalid multiPV/],
      [new Chess().fen(), { moves: ['e2e4\nquit'] }, /Invalid UCI/],
      [new Chess().fen(), { moves: ['e2e4'] }, /History does not reach/],
      [new Chess().fen(), { moves: ['e2e5'] }, /Invalid move/],
    ]) await assert.rejects(engine.analyze(fen, options), pattern);
    assert.equal((await engine.analyze(new Chess().fen(), { depth: 3, moves: [] })).positionSource, 'history');
  } finally { await engine.close(); }
});

test('FIXTURE: handshake timeout and stale bestmove drainage', async () => {
  await assert.rejects(openFixture('nohandshake', 300), /timeout.*uciok/);
  const engine = await openFixture('stale');
  try {
    for (let i = 0; i < 2; i++) assert.equal((await engine.analyze(new Chess().fen())).bestmove, 'e2e4');
  } finally { await engine.close(); }
});

test('HARNESS UNIT: terminal history wins over ply cap; no material adjudication', async () => {
  const { playEngineGame } = await import('../tools/engine-games.mjs');
  const engine = { identity: { name: 'UNIT TEST ONLY' }, analyze() { throw new Error('Must not search a finished game'); } };
  const mate = await playEngineGame({ engine, modelColor: 'w', opening: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], maxPlies: 4 });
  assert.equal(mate.result, '0-1'); assert.equal(mate.termination, 'checkmate');
  const repetition = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const repeated = await playEngineGame({ engine, modelColor: 'b', opening: repetition, maxPlies: 8 });
  assert.equal(repeated.result, '1/2-1/2'); assert.equal(repeated.termination, 'threefold-repetition');
  const cap = await playEngineGame({ engine, modelColor: 'b', opening: ['e2e4'], maxPlies: 1 });
  assert.equal(cap.termination, 'ply-cap');
  await assert.rejects(playEngineGame({ engine, modelColor: 'w', opening: ['e2e5'] }), /Invalid move/);
  await assert.rejects(playEngineGame({ engine, modelColor: 'w', opening: ['f2f3', 'e7e5', 'g2g4', 'd8h4', 'a2a3'] }), /Opening continues/);
  await assert.rejects(playEngineGame({ engine, modelColor: 'w', limit: { nodes: -1 } }), /Invalid engine limit/);
});

test('HARNESS UNIT: engine illegal/null moves are errors, never fallback or a result', async () => {
  const { playEngineGame } = await import('../tools/engine-games.mjs');
  for (const bestmove of ['a1a8', null]) {
    const engine = { identity: { name: 'UNIT TEST ONLY' }, async analyze() { return { bestmove }; } };
    await assert.rejects(playEngineGame({ engine, modelColor: 'b', maxPlies: 1 }), /Illegal/);
  }
});

test('REAL GNU Chess: node budget is bounded explicitly rather than ignored by its adapter', { timeout: 10000 }, async t => {
  try { await access(local('gnuchess'), constants.X_OK); }
  catch { t.skip('Real GNU Chess executable unavailable'); return; }
  const { openEngine } = await import('../tools/uci-engine.mjs');
  const engine = await openEngine({ kind: 'gnuchess', timeoutMs: 1500 });
  try {
    const result = await engine.analyze(new Chess().fen(), { nodes: 300 });
    assert.equal(result.limitMode, 'reported-nodes-stop');
    assert.ok(result.observedNodes >= 300);
    assert.ok(new Chess().move(result.bestmove));
    console.log(JSON.stringify({ receipt: 'gnuchess-node-budget', limitMode: result.limitMode, observedNodes: result.observedNodes, bestmove: result.bestmove }));
  } finally { await engine.close(); }
});

test('REAL classic Pocket versus GNU Chess: legal short game and PGN', { timeout: 20000 }, async t => {
  try { await access(local('gnuchess'), constants.X_OK); }
  catch { t.skip('Real GNU Chess executable unavailable'); return; }
  const { readFile } = await import('node:fs/promises');
  const { parseModel } = await import('../src/network.mjs');
  const { chooseMove } = await import('../src/engine.mjs');
  const { openEngine } = await import('../tools/uci-engine.mjs');
  const { playEngineGame } = await import('../tools/engine-games.mjs');
  const bytes = await readFile(new URL('../public/models/pocket.bin', import.meta.url));
  const model = parseModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const engine = await openEngine({ kind: 'gnuchess' });
  try {
    const result = await playEngineGame({ model, engine, opening: ['e2e4', 'e7e5'], modelColor: 'w', limit: { depth: 2 }, maxPlies: 12 });
    assert.equal(result.result, '1/2-1/2');
    assert.equal(result.termination, 'ply-cap');
    assert.equal(result.plies, 12);
    assert.equal(result.modelDecisions.length, 5);
    assert.equal(result.engineIdentity.name, 'GNU Chess 6.2.9');
    const replay = new Chess(); replay.loadPgn(result.pgn);
    assert.equal(replay.history().length, 12);
    for (const decision of result.modelDecisions) assert.equal(decision.move, chooseMove(decision.fen, model).move);
    console.log(JSON.stringify({ receipt: 'classic-pocket-game', ...result, modelDecisions: result.modelDecisions.map(({ ply, move }) => ({ ply, move })) }));
  } finally { await engine.close(); }
});

for (const kind of ['stockfish', 'gnuchess']) {
  test(`REAL ${kind}: handshake and legal moves with standard-start history`, { timeout: 20000 }, async t => {
    try { await access(local(kind), constants.X_OK); }
    catch { t.skip(`Real ${kind} executable unavailable: ${local(kind)}`); return; }
    const { openEngine } = await import('../tools/uci-engine.mjs');
    const engine = await openEngine({ kind, timeoutMs: 6000 });
    try {
      assert.match(engine.identity.name, kind === 'stockfish' ? /Stockfish/ : /GNU Chess/);
      assert.equal(engine.options.find(o => o.name === 'Hash').value, 16);
      assert.equal(engine.options.find(o => o.name === 'Ponder').value, false);
      const game = position();
      const result = await engine.analyze(game.fen(), { depth: 3, moves: history });
      assert.ok(game.moves({ verbose: true }).some(m => m.from + m.to + (m.promotion || '') === result.bestmove));
      assert.equal(result.positionSource, 'history');
      console.log(JSON.stringify({ receipt: kind, identity: engine.identity, options: engine.options.filter(o => 'value' in o), result }));
    } finally { await engine.close(); }
  });
}
