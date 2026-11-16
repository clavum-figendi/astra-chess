import test from 'node:test';
import assert from 'node:assert/strict';
import { createProtocol } from '../laptop/protocol.mjs';

test('UCI applies full move history and returns one supplied legal policy move', () => {
  const out = []; let evaluated;
  const protocol = createProtocol({ send: x => out.push(x), select: fen => { evaluated = fen; return { move: 'g1f3' }; } });
  protocol('uci'); protocol('isready'); protocol('position startpos moves e2e4 e7e5'); protocol('go wtime 10000 btime 10000');
  assert.ok(out.includes('uciok')); assert.ok(out.includes('readyok'));
  assert.match(out.find(line => line.startsWith('id author ')), /Astra.*Sol/);
  assert.match(evaluated, / w KQkq - 0 2$/);
  assert.equal(out.at(-1), 'bestmove g1f3');
});

test('UCI history detects repetition and does not ask the policy to move', () => {
  const out = [];
  const protocol = createProtocol({ send: x => out.push(x), select: () => { throw new Error('must not run'); } });
  protocol('position startpos moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');
  protocol('go');
  assert.equal(out.at(-1), 'bestmove 0000');
});

test('invalid UCI position cannot leave a stale playable board', () => {
  const out = [];
  const protocol = createProtocol({ send: x => out.push(x), select: () => ({move:'e2e4'}) });
  protocol('position startpos moves e2e5');
  assert.match(out.at(-1), /error/);
  protocol('go'); assert.notEqual(out.at(-1), 'bestmove e2e4');
  protocol('position startpos'); protocol('go'); assert.equal(out.at(-1), 'bestmove e2e4');
});
