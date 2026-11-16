import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createTuningState,rewriteWeights} from './weight-tuning.mjs';
import {optimizeHead} from './head-optimizer.mjs';
import {parseModel} from '../src/network.mjs';
import {chooseMove} from '../src/engine.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
mkdirSync('.cache/engine-tuned',{recursive:true});mkdirSync('evaluation/v0.3',{recursive:true});
const labels=JSON.parse(readFileSync('.cache/engine-data/validation.json'));
function measure(model){
 let sum=0,good=0,blunders=0;const regrets=[];
 for(const row of labels){const result=chooseMove(row.fen,model),chosen=row.moves.find(m=>m.move===result.move);if(!chosen)throw new Error('Model move absent from teacher labels');const regret=Math.min(2000,Math.max(0,Math.max(...row.moves.map(m=>m.score))-chosen.score));sum+=regret;regrets.push(regret);if(regret<=20)good++;if(regret>=200)blunders++;}
 regrets.sort((a,b)=>a-b);return {positions:labels.length,meanRegret:sum/labels.length,medianRegret:regrets[Math.floor(regrets.length/2)],within20cp:good/labels.length,blunder200cp:blunders/labels.length};
}
const summary={protocol:'bounded-head-fit-v3',startedAt:new Date().toISOString(),testSetUsed:false,sourceHashes:Object.fromEntries(['tools/weight-tuning.mjs','tools/head-optimizer.mjs','tools/optimize-engine-weights.mjs','src/engine.mjs','src/network.mjs'].map(path=>[path,hash(readFileSync(path))])),models:[]};
const frozen={protocol:summary.protocol,models:[]};
for(const baseId of ['pocket-plus','atlas-plus']){
 const id=baseId.replace('-plus','-tuned'),state=createTuningState(readFileSync(`public/models/${baseId}.bin`));
 const train=JSON.parse(readFileSync(`.cache/engine-features/${baseId}-train.json`)),validation=JSON.parse(readFileSync(`.cache/engine-features/${baseId}-validation.json`));
 if(train.baseSHA256!==state.baseSHA256||validation.baseSHA256!==state.baseSHA256)throw new Error('Feature cache belongs to a different base');
 if(JSON.stringify(train.groups)!==JSON.stringify(state.groups)||JSON.stringify(validation.groups)!==JSON.stringify(state.groups))throw new Error('Feature group mismatch');
 const baseline=measure(state.model);
 const fitted=optimizeHead({groups:state.groups,train:train.positions,validation:validation.positions},{onRound:round=>console.log(JSON.stringify({id,round:round.round,trainRegret:round.train.meanRegret,validationCachedRegret:round.validation.meanRegret,bestCachedRegret:round.bestMetrics.meanRegret,staleRounds:round.staleRounds}))});
 const candidates=[],seen=new Set();
 for(const round of fitted.history)for(const [checkpoint,scales] of [['last',round.scales],['best',round.bestScales]]){
  const vectorSHA256=hash(JSON.stringify(scales));if(seen.has(vectorSHA256)||scales.every(x=>x===1))continue;seen.add(vectorSHA256);
  const metadata={id,name:id==='pocket-tuned'?'Astra Pocket Tuned':'Astra Atlas Tuned',tuning:{protocol:summary.protocol,round:round.round,checkpoint,vectorSHA256,trainLabelsSHA256:train.labelSHA256,validationLabelsSHA256:validation.labelSHA256}};
  const bytes=rewriteWeights(state,scales,metadata),model=parseModel(bytes.buffer),metrics=measure(model);
  const path=`.cache/engine-tuned/${id}-r${round.round}-${checkpoint}.bin`;writeFileSync(path,bytes);
  const changedWeights=model.weights.reduce((n,w,e)=>n+(w!==state.model.weights[e]?1:0),0);
  candidates.push({round:round.round,checkpoint,scales,vectorSHA256,path,sha256:hash(bytes),bytes:bytes.length,changedWeights,metrics,metadata});
  console.log(JSON.stringify({id,serializedRound:round.round,checkpoint,actualValidation:metrics,changedWeights}));
 }
 if(!candidates.length)throw new Error('Optimizer produced no changed candidate');
 candidates.sort((a,b)=>a.metrics.meanRegret-b.metrics.meanRegret||a.changedWeights-b.changedWeights);
 const selected=candidates[0],qualified=selected.metrics.meanRegret<=baseline.meanRegret-1;
 const selectedBytes=readFileSync(selected.path),selectedPath=`.cache/engine-tuned/${id}.bin`;writeFileSync(selectedPath,selectedBytes);
 const record={id,baseId,baseSHA256:state.baseSHA256,groups:state.groups,baseline,optimizer:fitted,candidates,selected:{...selected,path:selectedPath,validationQualified:qualified},trainPositions:train.positions.length,validationPositions:validation.positions.length};
 summary.models.push(record);writeFileSync('evaluation/v0.3/optimization.json',JSON.stringify(summary,null,2)+'\n');
 frozen.models.push({id,baseId,path:selectedPath,sha256:hash(selectedBytes),scales:selected.scales,metadata:selected.metadata,validationQualified:qualified});
 console.log(JSON.stringify({selected:id,baselineRegret:baseline.meanRegret,selectedRegret:selected.metrics.meanRegret,qualified,stopReason:fitted.stopReason,rounds:fitted.history.length}));
}
summary.finishedAt=new Date().toISOString();writeFileSync('evaluation/v0.3/optimization.json',JSON.stringify(summary,null,2)+'\n');
frozen.frozenAt=summary.finishedAt;frozen.optimizationSHA256=hash(readFileSync('evaluation/v0.3/optimization.json'));writeFileSync('.cache/engine-tuned/selection-frozen.json',JSON.stringify(frozen,null,2)+'\n');
