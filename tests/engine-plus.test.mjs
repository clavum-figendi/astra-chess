import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModel} from '../tools/compile-models.mjs';
import {parseModel} from '../src/network.mjs';
import {chooseMove} from '../src/engine.mjs';
import {Chess} from '../src/chess.mjs';
import {readFileSync} from 'node:fs';

test('larger Plus variants carry three-man terminal knowledge and choose legal mating moves',()=>{
  for(const id of ['pocket-plus','atlas-plus']){
    const bytes=compileModel(id);const model=parseModel(bytes.buffer);
    assert.equal(model.metadata.id,id);
    assert.deepEqual(Buffer.from(bytes),readFileSync(new URL(`../public/models/${id}.bin`,import.meta.url)));
    const seen=new Set(),stack=[...new Set(model.outputs)];
    while(stack.length){const n=stack.pop()-model.inputCount;if(n<0||seen.has(n))continue;seen.add(n);for(let e=model.rowPtr[n];e<model.rowPtr[n+1];e++)stack.push(model.sources[e]);}
    assert.equal(seen.size,model.nodeCount);
    for(const fen of ['7k/5K2/6Q1/8/8/8/8/8 w - - 0 1','7k/5K2/8/7R/8/8/8/8 w - - 0 1','8/8/8/8/8/6q1/5k2/7K b - - 0 1']){
      const game=new Chess(fen);game.move(chooseMove(fen,model).move);
      assert.ok(game.isCheckmate(),id+' '+fen);
    }
    const fork='8/8/1q3k2/8/5r2/2N5/8/7K w - - 0 1';
    assert.equal(new Chess(fork).isCheck(),false);
    assert.equal(chooseMove(fork,model).move,'c3d5');
  }
});
