import test from 'node:test';import assert from 'node:assert/strict';
import {Chess} from '../src/chess.mjs';import {completeLabels} from '../tools/engine-labels.mjs';
const fen=new Chess().fen();
const record=()=>{const moves=new Chess(fen).moves({verbose:true}).map(m=>m.from+m.to);return {complete:true,depth:4,expectedLines:moves.length,lines:moves.map((move,i)=>({move,depth:4,cp:i}))};};
test('labels require complete exact same-depth coverage and preserve side-to-move scores',()=>{
 const r=record();const out=completeLabels(fen,r,4);assert.equal(out.length,20);assert.equal(out[1].score,r.lines.find(l=>l.move===out[1].move).cp);
 assert.throws(()=>completeLabels(fen,{...r,complete:false},4),/complete/);
 r.lines[0].bound='lowerbound';assert.throws(()=>completeLabels(fen,r,4),/exact/);
});
test('mate targets use an explicitly separate surrogate and reject ambiguous scores',()=>{
 const r=record();delete r.lines[0].cp;r.lines[0].mate=3;delete r.lines[1].cp;r.lines[1].mate=-2;
 const out=completeLabels(fen,r,4);assert.equal(out.find(m=>m.move===r.lines[0].move).score,9970);assert.equal(out.find(m=>m.move===r.lines[1].move).score,-9980);
 r.lines[0].cp=1;assert.throws(()=>completeLabels(fen,r,4),/ambiguous/);
});
