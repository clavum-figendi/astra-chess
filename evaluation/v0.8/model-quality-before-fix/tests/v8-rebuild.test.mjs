import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {rebuildVariant} from '../tools/rebuild-v8-models.mjs';
test('public fit receipts reconstruct both serialized relaxed candidates exactly without private caches',()=>{
 const manifest=JSON.parse(fs.readFileSync('evaluation/v0.8/weight-manifest.json'));
 for(const family of ['pocket','atlas']){
  const base=fs.readFileSync(`public/models/${family==='pocket'?'pocket-plus':'atlas'}.bin`),fit=JSON.parse(fs.readFileSync(`evaluation/v0.8/weight-${family}-development.json`)),expected=manifest.families[family].find(c=>c.id==='enemy-relaxed').sha256;
  const result=rebuildVariant(base,fit,'enemy-relaxed',expected);assert.equal(createHash('sha256').update(result).digest('hex'),expected);
  assert.throws(()=>rebuildVariant(base,{...fit,baseSHA256:'0'.repeat(64)},'enemy-relaxed',expected),/base/);
  assert.throws(()=>rebuildVariant(base,fit,'missing',expected),/candidate/);
 }
});
