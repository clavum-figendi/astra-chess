import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTuningState,rewriteWeights} from './weight-tuning.mjs';
import {parseModel} from '../src/network.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function rebuildTuned(root){
 const directory=join(root,'public/models'),config=JSON.parse(await readFile(join(directory,'tuned-config.json'),'utf8'));
 if(config.version!==1||!Array.isArray(config.models)||!config.models.length||config.models.length>2)throw new Error('Invalid tuned model config');
 const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8')),staged=[],ids=new Set();
 for(const item of config.models){
  if(!['pocket-plus','atlas-plus'].includes(item.baseId)||item.id!==item.baseId.replace('-plus','-tuned')||ids.has(item.id)||item.metadata?.id!==item.id)throw new Error('Invalid tuned model identity');ids.add(item.id);
  const base=await readFile(join(directory,`${item.baseId}.bin`)),state=createTuningState(base);
  if(state.baseSHA256!==item.baseSHA256)throw new Error('Base model hash mismatch');
  const bytes=rewriteWeights(state,item.scales,item.metadata);
  if(hash(bytes)!==item.sha256)throw new Error('Rebuilt tuned model hash mismatch');
  const model=parseModel(bytes.buffer),tensorBytes=4*(model.nodeCount+model.edgeCount),topologyBytes=4*(model.nodeCount*2+1+model.edgeCount+model.outputCount);
  const changedWeights=model.weights.reduce((n,w,e)=>n+(w!==state.model.weights[e]?1:0),0);
  staged.push({bytes,entry:{id:item.id,name:model.metadata.name,file:`${item.id}.bin`,bytes:bytes.length,sha256:hash(bytes),parameters:model.nodeCount+model.edgeCount,neurons:model.nodeCount,sparseEdges:model.edgeCount,inputs:model.inputCount,outputs:model.outputCount,tensorBytes,topologyBytes,headerMetadataBytes:bytes.length-tensorBytes-topologyBytes,forwardWorkingBytes:8*(model.inputCount+model.nodeCount+model.outputCount),engineTuned:true,trained:true,baseId:item.baseId,baseSHA256:state.baseSHA256,changedWeights,tiedMultiplierGroups:state.groups.length,freeMultiplierGroups:state.groups.filter(g=>!g.fixed).length,description:'Experimental engine-tuned output weights; no inference-time engine or search. Not fully optimized.',features:[...(manifest.models.find(m=>m.id===item.baseId)?.features||[]),'Stockfish-guided output-weight fitting'],authorship:model.metadata.authorship}});
 }
 for(const item of staged)await writeFile(join(directory,item.entry.file),item.bytes);
 const order=['pocket','pocket-plus','pocket-tuned','atlas','atlas-plus','atlas-tuned'];
 manifest.models=[...manifest.models.filter(m=>!['pocket-tuned','atlas-tuned'].includes(m.id)),...staged.map(x=>x.entry)].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
 manifest.provenance='Authored control models plus engine-tuned derivatives fitted to local Stockfish evaluation data. No pretrained tensors were imported; the teacher engine is used offline only. Authored base: Astra-directed, Sol-assisted. Optimization and numerical rewrite: Astra. Inference remains a single sparse neural pass with legal masking.';
 manifest.limitations=['Tuned variants use automatic supervised output-weight fitting; they are not training-free or purely hand-written.','Finite optimization budget in a tied-head family; global optimality, grandmaster strength and Elo are not established.',...(manifest.limitations||[]).filter(x=>!x.startsWith('Authored neural heuristics')&&!x.startsWith('Tuned variants use')&&!x.startsWith('Finite optimization budget'))];
 await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log((await rebuildTuned(fileURLToPath(new URL('..',import.meta.url)))).models.map(m=>({id:m.id,bytes:m.bytes,sha256:m.sha256,engineTuned:!!m.engineTuned})));
