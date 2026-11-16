import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPolicyState,legalPolicyFeatures,rewritePolicyWeights} from '../tools/policy-tuning.mjs';
import {parseModel} from '../src/network.mjs';
import {chooseMove} from '../src/engine.mjs';
import {encodeModel} from '../tools/compile-models.mjs';

test('sparse features match float32 serialization for both models, colors and promotions',()=>{
 for(const name of ['pocket-plus','atlas-plus']){
 const s=createPolicyState(readFileSync(`public/models/${name}.bin`));
 const scales=s.groups.map((g,i)=>g.fixed?1:.7+(i%5)*.23);
 const tuned=parseModel(rewritePolicyWeights(s,scales).buffer);
 for(const fen of ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2','4k3/P7/8/8/8/8/7p/4K3 w - - 0 1','4k3/P7/8/8/8/8/7p/4K3 b - - 0 1']){
  const features=legalPolicyFeatures(fen,s),actual=chooseMove(fen,tuned);
  for(const c of actual.candidates){const row=features.find(x=>x.move===c.move);const score=row.fixed+row.values.reduce((sum,v,k)=>sum+v*scales[row.indices[k]],0);assert.ok(Math.abs(score-c.score)<2e-5,`${c.move}: ${score} != ${c.score}`);assert.equal(new Set(row.indices).size,row.indices.length);}
 }
 assert.throws(()=>rewritePolicyWeights(s,[]),/length/);
 const bad=[...scales];bad[0]=NaN;assert.throws(()=>rewritePolicyWeights(s,bad),/multiplier/);
 const fixed=s.groups.findIndex(g=>g.fixed);bad[0]=1;bad[fixed]=2;assert.throws(()=>rewritePolicyWeights(s,bad),/multiplier/);
 }
});

test('shared heads use canonical output while internally used outputs remain untouched',()=>{
 const outputs=Array(20480).fill(769);outputs[0]=768;
 const bytes=encodeModel({inputCount:768,nodes:[{edges:[[0,2]],bias:0,activation:0},{edges:[[768,3],[384,1],[1,100]],bias:0,activation:0}],outputs,metadata:{}});
 const s=createPolicyState(bytes);assert.equal(s.heads.has(0),false);assert.equal(s.canonicalOutputs.get(769),1);
 assert.equal(s.edgeGroups[0],-1);assert.equal(s.groups.reduce((sum,g)=>sum+g.edges,0),3);
 const model=parseModel(rewritePolicyWeights(s,s.groups.map(g=>g.fixed?1:2)).buffer);
 assert.deepEqual(Array.from(model.weights),[2,6,1,100]);
});

test('geometry unties actual terminal edges into substantial deterministic capacity',()=>{
 for(const name of ['pocket-plus','atlas-plus']){
  const bytes=readFileSync(`public/models/${name}.bin`),s=createPolicyState(bytes),again=createPolicyState(bytes);
  const free=s.groups.filter(g=>!g.fixed);
  assert.ok(free.length>=500&&free.length<=3000,`${name}: ${free.length}`);
  assert.deepEqual(s.groups,again.groups);assert.deepEqual(s.edgeGroups,again.edgeGroups);
  assert.ok(s.groups.every(g=>g.edges>0));
  const nonzero=new Set();for(let e=0;e<s.model.edgeCount;e++)if(s.model.weights[e]!==0&&s.edgeGroups[e]>=0)nonzero.add(s.edgeGroups[e]);
  assert.ok(s.groups.every((g,i)=>g.fixed||nonzero.has(i)));
  assert.deepEqual(Uint8Array.from(bytes),s.bytes);
  const m=parseModel(rewritePolicyWeights(s,s.groups.map(g=>g.fixed?1:1.2)).buffer);
  assert.deepEqual(m.sources,s.model.sources);assert.deepEqual(m.outputs,s.model.outputs);
  assert.deepEqual(m.biases,s.model.biases);assert.deepEqual(m.activations,s.model.activations);
  for(let e=0;e<m.edgeCount;e++)if(s.edgeGroups[e]<0||s.groups[s.edgeGroups[e]].fixed)assert.equal(m.weights[e],s.model.weights[e]);
  assert.equal(m.metadata.policyDistilled,true);assert.equal(m.metadata.trained,true);
  assert.doesNotMatch(m.metadata.authorship,/Sol|agent/i);
 }
});
