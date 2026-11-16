import test from 'node:test';import assert from 'node:assert/strict';
import {optimizeHead,measureHead} from '../tools/head-optimizer.mjs';
const groups=[{key:'a',lower:.05,upper:4,fixed:false},{key:'b',lower:.05,upper:4,fixed:false},{key:'fixed',lower:1,upper:1,fixed:true}];
const row=id=>({id,moves:[{move:'a2a3',features:[2,0,0],fixed:0,score:0},{move:'b2b3',features:[0,1,0],fixed:0,score:300}]});
test('bounded engine-label fitting improves validation regret and preserves fixed coefficients',()=>{
 const train=Array.from({length:8},(_,i)=>row('train-'+i)),validation=Array.from({length:3},(_,i)=>row('val-'+i));
 const baseline=measureHead(validation,[1,1,1]);assert.equal(baseline.meanRegret,300);
 const result=optimizeHead({groups,train,validation},{maxRounds:6,epochsPerRound:80,patience:3});
 assert.equal(result.bestMetrics.meanRegret,0);assert.equal(result.scales[2],1);
 result.scales.forEach((x,i)=>assert.ok(x>=groups[i].lower&&x<=groups[i].upper));
 assert.ok(result.history.length>=2);assert.ok(result.history.length<=6);assert.match(result.stopReason,/plateau|round-cap/);
});
test('rejects overlap between fitting and validation position identifiers',()=>{
 assert.throws(()=>optimizeHead({groups,train:[row('same')],validation:[row('same')]},{}),/overlap/);
});
