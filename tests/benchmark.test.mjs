import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePuzzle, randomPolicy, greedyPolicy } from '../tools/benchmark-lib.mjs';
import { Chess } from '../src/chess.mjs';

test('puzzle scoring first applies the opponents prelude, then tests policy rather than solution replay', () => {
  const puzzle={fen:'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',moves:['g8f6','h5f7']};
  let seen;
  assert.equal(scorePuzzle(puzzle, fen=>{seen=fen; return 'h5f7';}).solved,true);
  assert.match(seen,/ w /);
  assert.equal(scorePuzzle(puzzle, ()=> 'h5h4').solved,false);
});

test('seeded random and capture baselines choose legal repeatable moves', () => {
  const game=new Chess(); const a=randomPolicy(99),b=randomPolicy(99);
  assert.equal(a(game.fen()),b(game.fen()));
  assert.doesNotThrow(()=>game.move(greedyPolicy(game.fen())));
});
