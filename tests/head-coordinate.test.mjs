import test from 'node:test';import assert from 'node:assert/strict';
import {coordinateHead} from '../tools/head-coordinate.mjs';
const data={groups:[{fixed:false,lower:.05,upper:4},{fixed:false,lower:.05,upper:4},{fixed:true,lower:1,upper:1}],train:[{id:'a',moves:[{move:'a2a3',features:[2,0,0],fixed:0,score:0},{move:'b2b3',features:[0,1,0],fixed:0,score:500}]}],validation:[{id:'b',moves:[{move:'a2a3',features:[2,0,0],fixed:0,score:0},{move:'b2b3',features:[0,1,0],fixed:0,score:500}]}]};
test('direct engine-regret coordinate passes change bounded weights without touching protected values',()=>{
 const result=coordinateHead(data,[1,1,1],2);assert.equal(result.history.length,2);assert.equal(result.history.at(-1).train.meanRegret,0);assert.equal(result.history.at(-1).validation.meanRegret,0);assert.equal(result.scales[2],1);assert.notDeepEqual(result.scales,[1,1,1]);
});
