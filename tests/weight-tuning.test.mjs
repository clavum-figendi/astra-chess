import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeModel} from '../tools/compile-models.mjs';
import {parseModel,forward} from '../src/network.mjs';
import {createTuningState,rewriteWeights,legalFeatures,predictFeatures} from '../tools/weight-tuning.mjs';
import {readFileSync} from 'node:fs';
import {chooseMove} from '../src/engine.mjs';

const fixture=()=>encodeModel({inputCount:768,nodes:[{edges:[[0,1]],bias:-0.5,activation:1},{edges:[[768,2],[384,1]],bias:0.1,activation:0},{edges:[[768,-3]],bias:-0.2,activation:0}],outputs:[769,770],metadata:{id:'fixture',trained:false}});
test('promotion-sized pawn contributions are not tied to small pawn-placement coefficients',()=>{
 const base=encodeModel({inputCount:768,nodes:[{edges:[[0,8],[1,.1]],bias:0,activation:0}],outputs:[768],metadata:{}});
 const s=createTuningState(base),scales=s.groups.map(g=>g.key==='input:0:small'?.5:1);
 const input=new Float32Array(768);input[0]=input[1]=1;
 assert.ok(Math.abs(forward(parseModel(rewriteWeights(s,scales).buffer),input)[0]-8.05)<1e-6);
});
test('rewrites actual stored head weights, preserving backbone and protected capture coefficients',()=>{
 const original=fixture(),state=createTuningState(original),scales=state.groups.map(g=>g.key==='relu:2'?2:g.key==='relu:-3'?.5:1);
 const tuned=rewriteWeights(state,scales,{id:'fixture-tuned',name:'Test'}),model=parseModel(tuned.buffer);
 const input=new Float32Array(768);input[0]=input[384]=1;
 const scores=forward(model,input);assert.ok(Math.abs(scores[0]-3.1)<1e-6);assert.ok(Math.abs(scores[1]+.95)<1e-6);
 assert.equal(model.metadata.trained,true);assert.equal(model.metadata.engineTuned,true);
 assert.deepEqual(original,fixture());assert.deepEqual(model.sources,state.model.sources);
 assert.equal(model.weights[0],1);assert.equal(model.weights[2],1);
});
test('rejects invalid multipliers and changes to protected groups',()=>{
 const s=createTuningState(fixture());const x=s.groups.map(()=>1);
 assert.throws(()=>rewriteWeights(s,[],{}),/length/);
 const invalid=[...x];invalid[0]=NaN;assert.throws(()=>rewriteWeights(s,invalid,{}),/multiplier/);
 const protectedIndex=s.groups.findIndex(g=>g.fixed);assert.ok(protectedIndex>=0);x[protectedIndex]=2;
 assert.throws(()=>rewriteWeights(s,x,{}),/multiplier/);
});
test('cached legal-move features reproduce real serialized inference for both colors',()=>{
 const s=createTuningState(readFileSync('public/models/pocket-plus.bin'));
 const scales=s.groups.map((g,i)=>g.fixed?1:.75+(i%4)*.25);
 const tuned=parseModel(rewriteWeights(s,scales,{id:'pocket-tuned',name:'Tuned'}).buffer);
 for(const fen of ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2']){
  const features=legalFeatures(fen,s);const predicted=predictFeatures(features,scales);const actual=chooseMove(fen,tuned);
  assert.equal(predicted[0].move,actual.move);
  for(const candidate of actual.candidates){const p=predicted.find(x=>x.move===candidate.move);assert.ok(Math.abs(p.score-candidate.score)<1e-5);}
 }
});
