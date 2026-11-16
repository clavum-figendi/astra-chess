import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPolicy,measurePolicy} from '../tools/policy-optimizer.mjs';
import {createPolicyState,legalPolicyFeatures,rewritePolicyWeights} from '../tools/policy-tuning.mjs';
import {parseModel} from '../src/network.mjs';
import {readFileSync} from 'node:fs';

test('SMOKE ONLY: v3 scalar data exercises new sparse fitting and binary roundtrip, not policy evidence',()=>{
 const state=createPolicyState(readFileSync('public/models/pocket-plus.bin'));
 const load=split=>JSON.parse(readFileSync(`evaluation/v0.3/data/${split}.json`)).slice(0,2).map(r=>{
  // These old labels have no genuine MultiPV ranks. Synthetic score order is
  // deliberately confined to this plumbing smoke test; never production labels.
  const ordered=[...r.moves].sort((a,b)=>b.score-a.score||a.move.localeCompare(b.move));
  const labels=new Map(ordered.map((m,i)=>[m.move,{rank:i+1,cp:m.cp}]));
  return {id:r.id,fen:r.fen,bestmove:ordered[0].move,moves:legalPolicyFeatures(r.fen,state).map(m=>({...m,...labels.get(m.move)}))};
 });
 const result=fitPolicy({groups:state.groups,train:load('train'),validation:load('validation')},{rounds:1,epochs:2});
 assert.ok(Number.isFinite(result.metrics.validation.crossEntropy));
 assert.ok(result.metrics.validation.crossEntropy<=result.baseline.validation.crossEntropy);
 assert.equal(parseModel(rewritePolicyWeights(state,result.scales).buffer).metadata.policyDistilled,true);
});
const fen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const other='rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2';
const groups=[{key:'x',lower:.05,upper:4,fixed:false,edges:1},{key:'protected',lower:1,upper:1,fixed:true,edges:1}];
const row=(id,f=fen)=>({id,fen:f,bestmove:'e2e4',moves:[{move:'e2e4',indices:[0],values:[1],fixed:0,rank:1,cp:-999},{move:'d2d4',indices:[],values:[],fixed:2,rank:2,cp:999}]});
test('rejects impossible MultiPV rank beyond legal move count',()=>{
 const r=row('bad');r.moves[1].rank=21;
 assert.throws(()=>measurePolicy([r],[1,1]),/rank/);
});
test('rejects malformed sparse rows, teacher labels, nonfinite values and leakage',()=>{
 const mutations=[r=>r.bestmove='a1a8',r=>r.bestmove='d2d4',r=>delete r.moves[0].rank,r=>r.moves[1].rank=1,r=>r.moves[1].move=r.moves[0].move,r=>r.moves[0].fixed=Infinity,r=>r.moves[0].cp=NaN,r=>r.moves[0].mate=Infinity,r=>r.moves[0].indices=[0,0],r=>r.moves[0].indices=[-1],r=>r.moves[0].indices=[2],r=>r.moves[0].indices=[.5],r=>r.moves[0].values=[NaN],r=>r.moves[0].values=[]];
 for(const mutate of mutations){const r=row('bad');mutate(r);assert.throws(()=>measurePolicy([r],[1,1]));}
 assert.throws(()=>measurePolicy([row('x')],[NaN,1]),/finite/);
 assert.throws(()=>measurePolicy([],[]),/nonempty/);
 assert.throws(()=>fitPolicy({groups,train:[row('x')],validation:[row('x',other)]}),/disjoint/);
 assert.throws(()=>fitPolicy({groups,train:[row('t')],validation:[row('v',fen.replace('0 1','9 7'))]}),/disjoint/);
 const data={groups,train:[row('t')],validation:[row('v',other)]};
 for(const opt of [{rounds:7},{epochs:151},{patience:3},{learningRate:NaN},{learningRate:0},{onRound:1}])assert.throws(()=>fitPolicy(data,opt));
 const bad=structuredClone(data);bad.groups[0].upper=Infinity;assert.throws(()=>fitPolicy(bad),/finite/);
 bad.groups[0].upper=.5;assert.throws(()=>fitPolicy(bad),/bounds/);
});

test('cold baseline is eligible and no-progress early stopping honors patience',()=>{
 const a=row('t'),b=row('v',other);for(const r of [a,b])for(const m of r.moves){m.indices=[];m.values=[];}
 const result=fitPolicy({groups,train:[a],validation:[b]},{epochs:1,rounds:6,patience:2,onRound:r=>r.scales.fill(99)});
 assert.deepEqual(result.scales,[1,1]);assert.deepEqual(result.metrics,result.baseline);assert.equal(result.history.length,2);
 assert.deepEqual(result.history[0].scales,[1,1]);assert.ok(result.history.every(r=>r.selected===false));
});

test('rank distribution contributes a quarter of the direct stable cross entropy',()=>{
 const r=row('x');const metrics=measurePolicy([r],[1,1]);
 const q=.75+.25/(1+Math.exp(-1));
 const expected=q*Math.log1p(Math.exp(1))+(1-q)*Math.log1p(Math.exp(-1));
 assert.ok(Math.abs(metrics.crossEntropy-expected)<1e-12);
 assert.equal(metrics.meanSelectedCP,999);assert.equal(metrics.meanTeacherRank,2);
});

test('direct bestmove/rank target overrides contrary numerical cp, selects validation and records bounded rounds',()=>{
 const data={groups,train:[row('t')],validation:[row('v',other)]},records=[];
 const result=fitPolicy(data,{rounds:3,epochs:70,learningRate:.08,onRound:r=>records.push(r)});
 assert.equal(result.baseline.validation.top1,0);assert.equal(result.metrics.validation.top1,1);
 assert.ok(result.metrics.validation.crossEntropy<result.baseline.validation.crossEntropy);
 assert.equal(result.scales[1],1);assert.ok(result.scales[0]>2&&result.scales[0]<=4);
 assert.equal(result.history.length,records.length);assert.ok(records.every(r=>r.scales.length===2&&r.metrics.validation));
 const changed=structuredClone(data);for(const split of ['train','validation'])for(const r of changed[split])for(const m of r.moves)m.cp=-m.cp;
 assert.deepEqual(fitPolicy(changed,{rounds:3,epochs:70,learningRate:.08}).scales,result.scales);
 assert.deepEqual(measurePolicy(data.validation,result.scales),result.metrics.validation);
});
