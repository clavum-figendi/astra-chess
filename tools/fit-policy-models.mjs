import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';
import {createPolicyState,legalPolicyFeatures,rewritePolicyWeights} from './policy-tuning.mjs';import {fitPolicy,measurePolicy} from './policy-optimizer.mjs';import {parseModel} from '../src/network.mjs';import {chooseMove} from '../src/engine.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),dir='.cache/policy-v4';
if(existsSync(`${dir}/test-exposed.json`)||existsSync('evaluation/v0.4/final-results.json'))throw new Error('Final test exposed; fitting permanently closed for this run');
if(existsSync(`${dir}/selection.json`))throw new Error('Selection already frozen; refuse overwrite');
const protocol=JSON.parse(readFileSync('evaluation/v0.4/data-protocol.json'));if(!protocol.finishedAt)throw new Error('Data generation incomplete');
const labels={};for(const split of ['train','validation']){const bytes=readFileSync(`${dir}/${split}.json`);if(hash(bytes)!==protocol.splitSHA256[split])throw new Error('Dataset hash mismatch');labels[split]=JSON.parse(bytes);}
mkdirSync(`${dir}/fit`,{recursive:true});
const sourceHashes=Object.fromEntries(['tools/fit-policy-models.mjs','tools/policy-tuning.mjs','tools/policy-optimizer.mjs'].map(p=>[p,hash(readFileSync(p))]));
const receipt={protocolSHA:protocol.protocolSHA,sourceHashes,startedAt:new Date().toISOString(),models:[]};
for(const baseId of ['pocket-plus','atlas-plus']){
 const id=baseId.replace('-plus','-policy'),state=createPolicyState(readFileSync(`public/models/${baseId}.bin`));
 const join=rows=>rows.map(r=>{const byMove=new Map(r.moves.map(m=>[m.move,m]));const features=legalPolicyFeatures(r.fen,state);if(features.length!==byMove.size)throw new Error('Incomplete legal feature coverage');return {...r,moves:features.map(f=>({...byMove.get(f.move),...f}))};});
 const train=join(labels.train),validation=join(labels.validation);
 console.log(JSON.stringify({id,freeGroups:state.groups.filter(g=>!g.fixed).length,train:train.length,validation:validation.length}));
 const fitted=fitPolicy({groups:state.groups,train,validation},{rounds:6,epochs:150,patience:2,onRound:r=>{writeFileSync(`${dir}/fit/${id}-round${r.round}.json`,JSON.stringify(r)+'\n');console.log(JSON.stringify({id,round:r.round,metrics:r.metrics,selected:r.selected}));}});
 const metadata={id,name:baseId.startsWith('pocket')?'Pocket Policy':'Atlas Policy',policyTraining:{teacher:'Stockfish 17.1',depth:6,objective:'0.75 bestmove + 0.25 rank-distribution cross entropy',protocolSHA:protocol.protocolSHA,trainSHA256:protocol.splitSHA256.train,validationSHA256:protocol.splitSHA256.validation}};
 const bytes=rewritePolicyWeights(state,fitted.scales,metadata),model=parseModel(bytes.buffer);let hits=0;
 for(const r of labels.validation){const answer=chooseMove(r.fen,model);if(answer.move===r.bestmove)hits++;}
 const actualTop1=hits/labels.validation.length;
 if(Math.abs(actualTop1-fitted.metrics.validation.top1)>1e-12)throw new Error('Serialized top1 differs from selected feature model');
 const path=`${dir}/fit/${id}.bin`;writeFileSync(path,bytes);
 const record={id,baseId,baseSHA256:state.baseSHA256,path,sha256:hash(bytes),bytes:bytes.length,metadata,groups:state.groups.length,freeGroups:state.groups.filter(g=>!g.fixed).length,changedWeights:model.weights.reduce((n,w,e)=>n+(w!==state.model.weights[e]?1:0),0),actualValidationTop1:actualTop1,...fitted};
 writeFileSync(`${dir}/fit/${id}.json`,JSON.stringify(record,null,2)+'\n');receipt.models.push(record);
}
receipt.finishedAt=new Date().toISOString();writeFileSync('evaluation/v0.4/optimization.json',JSON.stringify(receipt,null,2)+'\n');
const selection={frozenAt:receipt.finishedAt,protocolSHA:protocol.protocolSHA,optimizationSHA256:hash(readFileSync('evaluation/v0.4/optimization.json')),models:receipt.models.map(({id,baseId,baseSHA256,path,sha256,metadata,scales})=>({id,baseId,baseSHA256,path,sha256,metadata,scales}))};
writeFileSync(`${dir}/selection.json`,JSON.stringify(selection,null,2)+'\n');console.log(JSON.stringify({frozen:true,models:selection.models.map(m=>({id:m.id,sha256:m.sha256}))}));
