import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {encodeModel} from '../tools/compile-models.mjs';import {createTuningState,rewriteWeights} from '../tools/weight-tuning.mjs';import {rebuildTuned} from '../tools/rebuild-engine-tuned.mjs';
test('rebuilds a tuned artifact from pinned base/scales and labels its provenance',async()=>{
 const root=await mkdtemp(join(tmpdir(),'astra-tuned-'));
 try{
  const dir=join(root,'public/models');await mkdir(dir,{recursive:true});
  const base=encodeModel({inputCount:768,nodes:[{edges:[[0,.2]],bias:0,activation:0}],outputs:[768],metadata:{id:'pocket-plus',name:'Fixture',trained:false}});
  const state=createTuningState(base),scales=state.groups.map(()=>1.2),metadata={id:'pocket-tuned',name:'Pocket Tuned'},expected=rewriteWeights(state,scales,metadata),sha=createHash('sha256').update(expected).digest('hex');
  await writeFile(join(dir,'pocket-plus.bin'),base);await writeFile(join(dir,'manifest.json'),JSON.stringify({formatVersion:1,models:[{id:'pocket-plus'}],limitations:[]}));
  const config={version:1,models:[{id:'pocket-tuned',baseId:'pocket-plus',baseSHA256:state.baseSHA256,scales,metadata,sha256:sha}]};await writeFile(join(dir,'tuned-config.json'),JSON.stringify(config));
  const manifest=await rebuildTuned(root);assert.equal(manifest.models.find(m=>m.id==='pocket-tuned').engineTuned,true);assert.match(manifest.provenance,/fitted/);
  assert.deepEqual(await readFile(join(dir,'pocket-tuned.bin')),Buffer.from(expected));
  config.models[0].sha256='0'.repeat(64);await writeFile(join(dir,'tuned-config.json'),JSON.stringify(config));
  await assert.rejects(()=>rebuildTuned(root),/hash/);
 }finally{await rm(root,{recursive:true,force:true});}
});
