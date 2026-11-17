// Rebuild accepted derivatives from public fitted coefficients, never refit.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {repairState} from './v8-weights-sparse.mjs';
import {rewritePolicyWeights} from './policy-tuning.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function rebuildVariant(base,fit,candidateId,expectedSHA){
 if(sha(base)!==fit.baseSHA256)throw new Error('V8 base digest mismatch');
 const proposal=fit.candidates.find(c=>c.id===candidateId);
 if(!proposal||candidateId==='control')throw new Error('Unknown derivative candidate');
 const state=repairState(base);
 if(proposal.scales.length!==state.groups.length||fit.groups.length!==state.groups.length||state.groups.some((g,i)=>g.key!==fit.groups[i].key))throw new Error('V8 coefficient group mismatch');
 const scales=proposal.scales.map((v,i)=>Math.max(state.groups[i].lower,Math.min(state.groups[i].upper,v)));
 const result=rewritePolicyWeights(state,scales,{experiment:'v8-bounded-contrastive',candidate:candidateId,search:false});
 if(sha(result)!==expectedSHA)throw new Error('Rebuilt candidate digest mismatch');
 return result;
}
function main(){
 const decisionFile='evaluation/v0.8/release-decision.json';
 if(!existsSync(decisionFile)){console.log('No accepted V8 derivatives registered.');return;}
 const decision=JSON.parse(readFileSync(decisionFile));
 if(decision.approved!==true)throw new Error('V8 release decision not approved');
 for(const [file,digest] of Object.entries(decision.evidenceSHA256))if(sha(readFileSync(file))!==digest)throw new Error(`V8 acceptance evidence changed: ${file}`);
 const manifest=JSON.parse(readFileSync('public/models/manifest.json'));
 for(const [family,chosen] of Object.entries(decision.derivatives)){
  if(!['pocket','atlas'].includes(family))throw new Error('Unknown V8 family');
  const baseId=family==='pocket'?'pocket-plus':'atlas',base=manifest.models.find(m=>m.id===baseId);
  if(!base||!new RegExp(`^${baseId}\\.bin$`).test(base.file))throw new Error('Invalid V8 base manifest');
  const fit=JSON.parse(readFileSync(`evaluation/v0.8/weight-${family}-development.json`));
  const bytes=rebuildVariant(readFileSync(`public/models/${base.file}`),fit,chosen.candidate,chosen.sha256);
  const id=`${family}-v8`,file=`${id}.bin`;
  writeFileSync(`public/models/${file}`,bytes);
  const entry={...base,id,name:family==='atlas'?'Atlas':'Pocket',file,bytes:bytes.length,sha256:sha(bytes),headerMetadataBytes:bytes.length-base.tensorBytes-base.topologyBytes,trained:true,engineTuned:true,policyDistilled:true,baseId,baseSHA256:fit.baseSHA256,changedWeights:chosen.changedScalars,description:'Bounded contrastive Stockfish-policy coefficient derivative',authorship:'Astra-directed experiment; Sol-assisted coefficient fitting and implementation'};
  manifest.models=manifest.models.filter(m=>m.id!==id);manifest.models.push(entry);
 }
 writeFileSync('public/models/manifest.json',JSON.stringify(manifest,null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
