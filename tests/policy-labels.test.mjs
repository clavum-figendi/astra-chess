import test from 'node:test';import assert from 'node:assert/strict';import {Chess} from '../src/chess.mjs';import {policyLabels} from '../tools/policy-labels.mjs';
test('policy labels preserve actual bestmove and MultiPV ranks, rejecting incomplete or inconsistent responses',()=>{
 const fen=new Chess().fen(),moves=new Chess(fen).moves({verbose:true}).map(m=>m.from+m.to);
 const a={bestmove:moves[0],complete:true,depth:6,expectedLines:moves.length,lines:moves.map((move,i)=>({move,pv:[move],multipv:i+1,cp:i,depth:6}))};
 const r=policyLabels(fen,a,6);assert.equal(r.bestmove,moves[0]);assert.equal(r.moves.find(m=>m.move===moves[1]).rank,2);
 assert.throws(()=>policyLabels(fen,{...a,bestmove:moves[1]},6),/bestmove/);
 assert.throws(()=>policyLabels(fen,{...a,lines:a.lines.map(m=>({...m,multipv:1}))},6),/rank/);
 assert.throws(()=>policyLabels(fen,{...a,complete:false},6),/Incomplete/);
});
