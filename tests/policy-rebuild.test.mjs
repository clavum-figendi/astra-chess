import test from 'node:test';import assert from 'node:assert/strict';import {rebuildPolicyModels} from '../tools/rebuild-policy-models.mjs';
test('frozen policy artifacts reconstruct exactly without fitting or reading final test',async()=>{
 const result=await rebuildPolicyModels(new URL('..',import.meta.url),{write:false});assert.equal(result.models.length,8);
 for(const id of ['pocket-policy','atlas-policy']){const m=result.models.find(m=>m.id===id);assert.equal(m.policyDistilled,true);assert.ok(m.freeGroups>1000);assert.ok(!/astra|sol/i.test(m.name));}
 assert.ok(!/astra|sol/i.test(result.provenance));
});
