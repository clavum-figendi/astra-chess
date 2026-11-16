import test from 'node:test';import assert from 'node:assert/strict';import {Chess} from '../src/chess.mjs';import {teacherPolicy} from '../tools/teacher-policy.mjs';
test('top-K teacher keeps exact ranked alternatives separate from full legal mask',()=>{
 const fen=new Chess().fen(),legal=new Chess(fen).moves({verbose:true}).map(m=>m.from+m.to).sort();
 const a={complete:true,depth:10,expectedLines:4,bestmove:legal[0],lines:legal.slice(0,4).map((move,i)=>({move,pv:[move],multipv:i+1,depth:10,cp:20-i}))};
 const p=teacherPolicy(fen,a,10,4);assert.equal(p.legal.length,20);assert.equal(p.teacher.length,4);assert.equal(p.bestmove,legal[0]);
 assert.throws(()=>teacherPolicy(fen,{...a,bestmove:legal[1]},10,4),/bestmove/);
 assert.throws(()=>teacherPolicy(fen,{...a,lines:a.lines.map(m=>({...m,bound:'lowerbound'}))},10,4),/exact/);
 assert.throws(()=>teacherPolicy(fen,{...a,complete:false},10,4),/Incomplete/);
});
