import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createClock } from '../src/clock.mjs';

test('single premove is immutable, replaced, consumed once and legally rechecked after reply', async () => {
  const module = await import('../src/premove.mjs').catch(() => null);
  assert.ok(module, 'premove module must exist');
  const queue = module.createPremove(); const game = new Chess();
  game.move('e4');
  assert.equal(queue.set(game, 'w', 'g1', 'f3', 1), true);
  assert.ok(Object.isFrozen(queue.peek()));
  assert.equal(queue.set(game, 'w', 'd2', 'd4', 1), true);
  game.move('e5');
  assert.equal(queue.take(game, {human:'w',token:1,active:true})?.san, 'd4');
  assert.equal(queue.take(game, {human:'w',token:1,active:true}), null);
});

test('invalid, stale, terminal and flagged premoves are discarded without clock increment', async () => {
  const {createPremove} = await import('../src/premove.mjs');
  for (const reason of ['illegal','stale','flag','inactive']) {
    const game = new Chess(); game.move('e4'); const q = createPremove();
    assert.equal(q.set(game,'w','g1',reason === 'illegal' ? 'g5' : 'f3',2),true);
    game.move('e5');
    let now = 0; const clock = createClock({initialMs:1000,incrementMs:100,now:()=>now}); clock.start('w'); now=25;
    const before=clock.snapshot().w;
    const move=q.take(game,{human:'w',token:reason==='stale'?3:2,active:reason!=='inactive',flagged:reason==='flag'});
    assert.equal(move,null,reason); assert.equal(clock.snapshot().w,before); assert.equal(q.peek(),null);
  }
  const game=new Chess('7k/P7/8/8/8/8/8/6K1 b - - 0 1'); const q=createPremove();
  q.set(game,'w','a7','a8',1); game.move('Kh7');
  assert.equal(q.take(game,{human:'w',token:1,active:true}).promotion,'q');
  assert.equal(q.set(game,'b','h7','h7',1),false);
});
