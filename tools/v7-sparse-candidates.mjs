import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createTuningState} from './weight-tuning.mjs';
import {legalPolicyFeatures,rewritePolicyWeights} from './policy-tuning.mjs';
import {fitPolicy} from './policy-optimizer.mjs';
const dir='.cache/v7',out='evaluation/v0.7',hash=x=>createHash('sha256').update(x).digest('hex');mkdirSync(dir,{recursive:true});
if(existsSync(`${dir}/selection.json`)||existsSync(`${dir}/test-exposed.json`))throw new Error('v7 selection frozen');
const sources=Object.fromEntries(['tools/v7-sparse-candidates.mjs','tools/weight-tuning.mjs','tools/policy-tuning.mjs','tools/policy-optimizer.mjs'].map(p=>[p,hash(readFileSync(p))]));
const reportPath=`${out}/sparse-proposals.json`,report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath)):{sources,proposals:[]};
if(JSON.stringify(sources)!==JSON.stringify(report.sources))throw new Error('Proposal source changed');
for(const family of ['pocket','atlas']){
 if(report.proposals.some(p=>p.id===`${family}-coarse`))continue;
 const base=`${family}-plus`,state=createTuningState(readFileSync(`public/models/${base}.bin`)),splits={};
 for(const split of ['train','validation']){
  const labels=JSON.parse(readFileSync(`evaluation/v0.4/data/${split}.json`));
  splits[split]=labels.map((row,i)=>{
   const teacher=new Map(row.moves.map(m=>[m.move,m]));const features=legalPolicyFeatures(row.fen,state);
   if(features.length!==teacher.size||features.some(m=>!teacher.has(m.move)))throw new Error('Full legal teacher coverage mismatch');
   if(i%100===0)console.log(JSON.stringify({cache:family,split,position:i}));
   return {...row,moves:features.map(m=>({...m,rank:teacher.get(m.move).rank}))};
  });
 }
 const fit=fitPolicy({groups:state.groups,...splits},{rounds:3,epochs:60,learningRate:.015,patience:2});
 const choices=[{scales:state.groups.map(()=>1),metrics:fit.baseline,round:0},...fit.history];
 choices.sort((a,b)=>b.metrics.validation.top1-a.metrics.validation.top1||a.metrics.validation.crossEntropy-b.metrics.validation.crossEntropy||a.round-b.round);
 const best=choices[0],bytes=rewritePolicyWeights(state,best.scales,{name:`${family==='pocket'?'Pocket':'Atlas'} candidate`,experiment:'v7-coarse-policy',objective:'Stockfish bestmove/rank policy',selectedRound:best.round});
 const file=`${dir}/${family}-coarse.bin`;writeFileSync(file,bytes);
 report.proposals.push({id:`${family}-coarse`,base,baseSHA256:state.baseSHA256,file,sha256:hash(bytes),bytes:bytes.length,groups:state.groups,freeGroups:state.groups.filter(g=>!g.fixed).length,selectedRound:best.round,scales:best.scales,baseline:fit.baseline,metrics:best.metrics,history:fit.history,v7LabelsRead:false});
 writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({family,baseline:fit.baseline.validation,selected:best.metrics.validation,round:best.round}));
}
