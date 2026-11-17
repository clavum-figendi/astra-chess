import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const path=new URL('../tools/v8-weights-sparse.mjs',import.meta.url);
test('enemy material is opt-in mutable but every king/mate-scale edge stays fixed',async()=>{
 assert.ok(existsSync(path),'bounded sparse repair tool missing');
 const {repairState}=await import(path);
 const s=repairState(readFileSync('public/models/pocket-plus.bin'));
 let enemy=0,protectedCount=0;
 for(let e=0;e<s.model.edgeCount;e++){
  const g=s.edgeGroups[e];if(g<0)continue;
  if(Math.abs(s.model.weights[e])>=50){assert.ok(s.groups[g].fixed);protectedCount++;}
  const src=s.model.sources[e];if(src>=384&&src<704&&Math.abs(s.model.weights[e])<50){assert.ok(s.groups[g].enemy);assert.equal(s.groups[g].lower,.5);assert.equal(s.groups[g].upper,1.5);enemy++;}
 }
 assert.equal(enemy,9400);assert.ok(protectedCount>5000);
});
