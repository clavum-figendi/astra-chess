// Pure reconstruction from public fitted coefficients, never refit or publish.
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
// CLI intentionally ignores every argument and never reads decisions or writes files.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 console.log('Read-only V8 helper: no publication. Public model weights and manifests are unchanged.');
}
