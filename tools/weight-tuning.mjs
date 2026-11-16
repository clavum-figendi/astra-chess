// Development-only weight editor/cache. The deployed runtime is unchanged.
import {createHash} from 'node:crypto';
import {Chess} from '../src/chess.mjs';
import {encodePosition} from '../src/engine.mjs';
import {parseModel,checksum} from '../src/network.mjs';

export function createTuningState(source){
 const bytes=new Uint8Array(source instanceof ArrayBuffer?source:source.buffer,source instanceof ArrayBuffer?0:source.byteOffset,source instanceof ArrayBuffer?source.byteLength:source.byteLength).slice();
 const model=parseModel(bytes.buffer),used=new Uint8Array(model.nodeCount);
 for(const s of model.sources)if(s>=model.inputCount)used[s-model.inputCount]=1;
 const heads=new Set([...new Set(model.outputs)].map(i=>i-model.inputCount).filter(n=>n>=0&&!used[n]&&model.activations[n]===0));
 const groups=[],byKey=new Map(),edgeGroups=new Int32Array(model.edgeCount).fill(-1);
 for(const n of heads)for(let e=model.rowPtr[n];e<model.rowPtr[n+1];e++){
  const source=model.sources[e],weight=model.weights[e];
  const key=source<model.inputCount?`input:${Math.floor(source/64)}:${Math.abs(weight)>=2?'large':'small'}`:`${model.activations[source-model.inputCount]?'relu':'affine'}:${Number(weight.toFixed(5))}`;
  const fixed=(source>=384&&source<704)||Math.abs(weight)>=50;
  const qualified=key+(fixed?':fixed':'');
  if(!byKey.has(qualified)){byKey.set(qualified,groups.length);groups.push({key,fixed,lower:fixed?1:.05,upper:fixed?1:4,edges:0});}
  const group=byKey.get(qualified);edgeGroups[e]=group;groups[group].edges++;
 }
 return {bytes,model,heads,groups,edgeGroups,baseSHA256:createHash('sha256').update(bytes).digest('hex')};
}
function trace(model,input){
 if(input.length!==model.inputCount)throw new Error('Input length mismatch');
 const values=new Float64Array(model.inputCount+model.nodeCount);values.set(input);
 for(let n=0;n<model.nodeCount;n++){
  let sum=model.biases[n];for(let e=model.rowPtr[n];e<model.rowPtr[n+1];e++)sum+=values[model.sources[e]]*model.weights[e];
  values[model.inputCount+n]=model.activations[n]?Math.max(0,sum):sum;
 }
 return values;
}
export function legalFeatures(fen,state){
 const board=new Chess(fen),own=board.turn();
 if(board.isInsufficientMaterial()||board.isDrawByFiftyMoves())return [];
 const values=trace(state.model,encodePosition(fen));
 const index=s=>(own==='w'?Number(s[1])-1:8-Number(s[1]))*8+s.charCodeAt(0)-97;
 return board.moves({verbose:true}).map(move=>{
  const output=(index(move.from)*64+index(move.to))*5+(move.promotion?' qrbn'.indexOf(move.promotion):0);
  const node=state.model.outputs[output]-state.model.inputCount;
  const features=new Float64Array(state.groups.length);
  let fixed=values[state.model.outputs[output]];
  if(state.heads.has(node)){
   fixed=state.model.biases[node];
   for(let e=state.model.rowPtr[node];e<state.model.rowPtr[node+1];e++){
    const value=values[state.model.sources[e]]*state.model.weights[e],group=state.edgeGroups[e];
    if(group<0)fixed+=value;else features[group]+=value;
   }
  }
  return {move:move.from+move.to+(move.promotion||''),features:Array.from(features),fixed};
 }).sort((a,b)=>a.move.localeCompare(b.move));
}
export function predictFeatures(rows,scales){
 return rows.map(row=>({move:row.move,score:row.fixed+row.features.reduce((sum,x,i)=>sum+x*scales[i],0)})).sort((a,b)=>b.score-a.score||(a.move<b.move?-1:a.move>b.move?1:0));
}
export function rewriteWeights(state,scales,metadata={}){
 if(scales.length!==state.groups.length)throw new Error('Multiplier length mismatch');
 scales.forEach((scale,i)=>{if(!Number.isFinite(scale)||scale<state.groups[i].lower||scale>state.groups[i].upper)throw new Error(`Invalid multiplier for ${state.groups[i].key}`);});
 const old=new DataView(state.bytes.buffer),oldPadded=Math.ceil(old.getUint32(28,true)/4)*4;
 const meta=new TextEncoder().encode(JSON.stringify({...state.model.metadata,...metadata,authored:false,authoredBackbone:true,trained:true,engineTuned:true,search:false,baseSHA256:state.baseSHA256,authorship:'Astra-authored circuit expansion; engine-guided output-weight fitting; inherited Sol-assisted base'}));
 const padded=Math.ceil(meta.length/4)*4,payload=state.bytes.length-40-oldPadded+padded;
 const bytes=new Uint8Array(40+payload);bytes.set(state.bytes.subarray(0,40));bytes.set(meta,40);bytes.set(state.bytes.subarray(40+oldPadded),40+padded);
 const view=new DataView(bytes.buffer);view.setUint32(28,meta.length,true);view.setUint32(32,payload,true);
 const offset=40+padded+4*(state.model.nodeCount*3+1+state.model.edgeCount);
 for(let e=0;e<state.model.edgeCount;e++){const g=state.edgeGroups[e];if(g>=0)view.setFloat32(offset+e*4,state.model.weights[e]*scales[g],true);}
 view.setUint32(36,checksum(bytes.subarray(40)),true);
 return bytes;
}
