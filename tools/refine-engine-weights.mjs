import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createTuningState,rewriteWeights} from './weight-tuning.mjs';
import {coordinateHead} from './head-coordinate.mjs';
import {parseModel} from '../src/network.mjs';
import {chooseMove} from '../src/engine.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(existsSync('evaluation/v0.3/engine-results.json')||existsSync('.cache/engine-features/pocket-plus-test.json'))throw new Error('Final test already opened; cannot refine this selection');
const path='evaluation/v0.3/optimization.json',before=readFileSync(path),summary=JSON.parse(before);
if(summary.coordinatePhaseFinishedAt)throw new Error('Alternative budget already consumed');
writeFileSync('evaluation/v0.3/optimization-adam.json',before);
const labels=JSON.parse(readFileSync('.cache/engine-data/validation.json'));
function measure(model){let sum=0,good=0,bad=0;const values=[];for(const row of labels){const move=chooseMove(row.fen,model).move,chosen=row.moves.find(m=>m.move===move);if(!chosen)throw new Error('Invalid candidate move');const regret=Math.min(2000,Math.max(0,Math.max(...row.moves.map(m=>m.score))-chosen.score));sum+=regret;values.push(regret);if(regret<=20)good++;if(regret>=200)bad++;}values.sort((a,b)=>a-b);return {positions:labels.length,meanRegret:sum/labels.length,medianRegret:values[Math.floor(values.length/2)],within20cp:good/labels.length,blunder200cp:bad/labels.length};}
const frozen={protocol:summary.protocol,models:[]};
for(const record of summary.models){
 const state=createTuningState(readFileSync(`public/models/${record.baseId}.bin`));if(state.baseSHA256!==record.baseSHA256)throw new Error('Base changed');
 const train=JSON.parse(readFileSync(`.cache/engine-features/${record.baseId}-train.json`)),validation=JSON.parse(readFileSync(`.cache/engine-features/${record.baseId}-validation.json`));
 const passes=Math.min(2,6-record.optimizer.history.length);
 if(passes>0){
  const fitted=coordinateHead({groups:state.groups,train:train.positions,validation:validation.positions},record.selected.scales,passes);record.coordinate=fitted;
  for(const step of fitted.history){
   const round=record.optimizer.history.length+step.pass,metadata={...record.selected.metadata,tuning:{...record.selected.metadata.tuning,round,checkpoint:'coordinate',strategy:'direct-training-regret',vectorSHA256:hash(JSON.stringify(step.scales))}};
   const bytes=rewriteWeights(state,step.scales,metadata),model=parseModel(bytes.buffer),metrics=measure(model),candidatePath=`.cache/engine-tuned/${record.id}-r${round}-coordinate.bin`;
   writeFileSync(candidatePath,bytes);const changedWeights=model.weights.reduce((n,w,e)=>n+(w!==state.model.weights[e]?1:0),0);
   record.candidates.push({round,checkpoint:'coordinate',scales:step.scales,path:candidatePath,sha256:hash(bytes),bytes:bytes.length,changedWeights,metrics,metadata});
   console.log(JSON.stringify({id:record.id,round,strategy:'coordinate',trainingRegret:step.train.meanRegret,actualValidation:metrics,changes:step.changes}));
  }
 }
 record.candidates.sort((a,b)=>a.metrics.meanRegret-b.metrics.meanRegret||a.changedWeights-b.changedWeights);
 const selected=record.candidates[0],selectedPath=`.cache/engine-tuned/${record.id}.bin`,bytes=readFileSync(selected.path);writeFileSync(selectedPath,bytes);
 record.selected={...selected,path:selectedPath,validationQualified:selected.metrics.meanRegret<=record.baseline.meanRegret-1};
 frozen.models.push({id:record.id,baseId:record.baseId,path:selectedPath,sha256:hash(bytes),scales:selected.scales,metadata:selected.metadata,validationQualified:record.selected.validationQualified});
 console.log(JSON.stringify({selected:record.id,round:selected.round,validationRegret:selected.metrics.meanRegret,baselineRegret:record.baseline.meanRegret}));
}
summary.firstPhaseFinishedAt=summary.finishedAt;summary.finishedAt=new Date().toISOString();summary.coordinatePhaseFinishedAt=summary.finishedAt;summary.alternativeSourceHashes=Object.fromEntries(['tools/head-coordinate.mjs','tools/refine-engine-weights.mjs'].map(p=>[p,hash(readFileSync(p))]));
writeFileSync(path,JSON.stringify(summary,null,2)+'\n');
frozen.frozenAt=summary.finishedAt;frozen.optimizationSHA256=hash(readFileSync(path));writeFileSync('.cache/engine-tuned/selection-frozen.json',JSON.stringify(frozen,null,2)+'\n');
