import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';import {createPolicyState,rewritePolicyWeights} from './policy-tuning.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function rebuildPolicyModels(root,{write=true}={}){
 if(root instanceof URL)root=fileURLToPath(root);const dir=join(root,'public/models'),config=JSON.parse(readFileSync(join(dir,'policy-config.json'))),manifest=JSON.parse(readFileSync(join(dir,'manifest.json')));
 if(config.version!==1||config.models.length!==2||new Set(config.models.map(m=>m.id)).size!==2)throw new Error('Invalid policy configuration');
 const staged=[];
 for(const m of config.models){
  if(!['pocket-policy','atlas-policy'].includes(m.id)||m.baseId!==m.id.replace('-policy','-plus')||m.metadata.id!==m.id)throw new Error('Invalid policy identity');
  const state=createPolicyState(readFileSync(join(dir,`${m.baseId}.bin`)));if(state.baseSHA256!==m.baseSHA256)throw new Error('Base hash mismatch');
  const bytes=rewritePolicyWeights(state,m.scales,m.metadata);if(hash(bytes)!==m.sha256)throw new Error('Policy hash mismatch');
  const base=manifest.models.find(x=>x.id===m.baseId);if(!base)throw new Error('Missing manifest base');
  staged.push({bytes,entry:{...base,id:m.id,name:m.metadata.name,file:`${m.id}.bin`,bytes:bytes.length,sha256:m.sha256,headerMetadataBytes:bytes.length-base.tensorBytes-base.topologyBytes,trained:true,engineTuned:true,policyDistilled:true,baseId:m.baseId,freeGroups:state.groups.filter(g=>!g.fixed).length,description:'Stockfish best-move and ranked-policy distillation',authorship:'Engine-supervised policy',features:[...base.features,'Geometry-specific learned policy coefficients']}});
 }
 const order=['pocket','pocket-plus','pocket-tuned','pocket-policy','atlas','atlas-plus','atlas-tuned','atlas-policy'];
 const neutral=s=>s.replace(/\b(?:Astra|Sol)(?:-authored|-assisted|-directed)?\b\s*/gi,'').trim();
 manifest.models=[...manifest.models.filter(m=>!m.policyDistilled),...staged.map(s=>s.entry)].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)).map(m=>({...m,name:neutral(m.name),authorship:'Chess Lab contributors',description:m.policyDistilled?m.description:'Sparse neural chess policy',features:(m.features||[]).map(neutral)}));
 manifest.provenance='Chess Lab: original sparse circuits, score-fitted variants, and Stockfish best-move/ranked-policy derivatives. Opening book selection is a separate optional gameplay layer.';delete manifest.limitations;
 if(write){for(const {bytes,entry}of staged)writeFileSync(join(dir,entry.file),bytes);writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');}
 return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log((await rebuildPolicyModels(new URL('..',import.meta.url))).models.map(m=>({id:m.id,bytes:m.bytes,sha256:m.sha256})));
