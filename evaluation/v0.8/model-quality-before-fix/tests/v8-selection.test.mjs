import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {Chess} from '../src/chess.mjs';import {chooseMove} from '../src/engine.mjs';import {loadBoundModel,legalScores} from '../tools/v8-score-sparse.mjs';
test('serialized all-legal scores preserve deployed ranking and reject tampering',()=>{
 const file='public/models/pocket-plus.bin',sha256=createHash('sha256').update(readFileSync(file)).digest('hex'),model=loadBoundModel({file,sha256});
 const board=new Chess();for(const san of ['e4','e5','Nf3','Nc6'])board.move(san);
 const legal=board.moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')).sort(),scores=legalScores(board.fen(),model,legal),chosen=legal.map((m,i)=>({move:m,score:scores[i]})).sort((a,b)=>b.score-a.score||a.move.localeCompare(b.move));
 assert.equal(chosen[0].move,chooseMove(board.fen(),model).move);assert.deepEqual(chosen.slice(0,5),chooseMove(board.fen(),model).candidates);
 assert.throws(()=>loadBoundModel({file,sha256:'0'.repeat(64)}),/digest/);assert.throws(()=>legalScores(board.fen(),model,['a1a8']),/legal/);
});
