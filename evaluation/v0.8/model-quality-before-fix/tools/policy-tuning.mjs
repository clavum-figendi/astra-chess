// Development-only geometry-conditioned terminal affine weight fitting.
import {createTuningState} from './weight-tuning.mjs';
import {Chess} from '../src/chess.mjs';
import {encodePosition} from '../src/engine.mjs';
import {checksum} from '../src/network.mjs';

export function createPolicyState(bytes){
 const state=createTuningState(bytes),oldGroups=state.groups,oldEdges=state.edgeGroups;
 const canonical=new Map();
 // Ascending output index: shared output IDs always use their first representative.
 for(let i=0;i<state.model.outputs.length;i++)if(!canonical.has(state.model.outputs[i]))canonical.set(state.model.outputs[i],i);
 const groups=[],byKey=new Map(),edgeGroups=new Int32Array(state.model.edgeCount).fill(-1);
 for(const n of state.heads){
  const output=canonical.get(n+state.model.inputCount),promotion=output%5;
  const to=Math.floor(output/5)%64,from=Math.floor(output/320);
  const dx=to%8-from%8,dy=Math.floor(to/8)-Math.floor(from/8);
  const geometry=Math.abs(dx)*Math.abs(dy)===2?'knight':`${dx===0?'straight':'lateral'},${Math.sign(dy)}`;
  const band=`${to%8<2||to%8>5?'edge':'center'}:${Math.floor(to/8)<4?'home':'away'}`;
  for(let e=state.model.rowPtr[n];e<state.model.rowPtr[n+1];e++){
   const old=oldGroups[oldEdges[e]];
   const key=old.fixed?`${old.key}:fixed`:`${old.key}|g:${geometry}|d:${band}|p:${promotion}`;
   if(!byKey.has(key)){byKey.set(key,groups.length);groups.push({key,lower:old.lower,upper:old.upper,fixed:old.fixed,edges:0});}
   const g=byKey.get(key);edgeGroups[e]=g;groups[g].edges++;
  }
 }
 return {...state,groups,edgeGroups,canonicalOutputs:canonical};
}

export function legalPolicyFeatures(fen,state){
 const {model}=state,board=new Chess(fen),own=board.turn();
 if(board.isInsufficientMaterial()||board.isDrawByFiftyMoves())return [];
 const input=encodePosition(fen);
 if(input.length!==model.inputCount)throw new Error('Input length mismatch');
 const forward=new Float64Array(model.inputCount+model.nodeCount);forward.set(input);
 for(let n=0;n<model.nodeCount;n++){
  let sum=model.biases[n];for(let e=model.rowPtr[n];e<model.rowPtr[n+1];e++)sum+=forward[model.sources[e]]*model.weights[e];
  forward[model.inputCount+n]=model.activations[n]?Math.max(0,sum):sum;
 }
 const index=s=>(own==='w'?Number(s[1])-1:8-Number(s[1]))*8+s.charCodeAt(0)-97;
 return board.moves({verbose:true}).map(move=>{
  const output=(index(move.from)*64+index(move.to))*5+(move.promotion?' qrbn'.indexOf(move.promotion):0);
  if(output>=model.outputs.length)throw new Error('Missing move output');
  const node=model.outputs[output]-model.inputCount,features=new Map();
  let fixed=forward[model.outputs[output]];
  if(state.heads.has(node)){
   fixed=model.biases[node];
   for(let e=model.rowPtr[node];e<model.rowPtr[node+1];e++){
    const value=forward[model.sources[e]]*model.weights[e],g=state.edgeGroups[e];
    if(g<0||state.groups[g].fixed)fixed+=value;
    else if(value!==0)features.set(g,(features.get(g)||0)+value);
   }
  }
  const entries=[...features].filter(([,v])=>v!==0).sort((a,b)=>a[0]-b[0]);
  return {move:move.from+move.to+(move.promotion||''),indices:entries.map(([i])=>i),values:entries.map(([,v])=>v),fixed};
 }).sort((a,b)=>a.move.localeCompare(b.move));
}

export function rewritePolicyWeights(state,scales,metadata={}){
 if(scales.length!==state.groups.length)throw new Error('Multiplier length mismatch');
 for(let i=0;i<scales.length;i++)if(!Number.isFinite(scales[i])||scales[i]<state.groups[i].lower||scales[i]>state.groups[i].upper)throw new Error(`Invalid multiplier for ${state.groups[i].key}`);
 const old=new DataView(state.bytes.buffer),oldPadded=Math.ceil(old.getUint32(28,true)/4)*4;
 const meta=new TextEncoder().encode(JSON.stringify({...state.model.metadata,...metadata,authored:false,authoredBackbone:true,trained:true,engineTuned:true,policyDistilled:true,search:false,baseSHA256:state.baseSHA256,authorship:'Authored backbone; geometry-conditioned terminal weights fitted to ranked engine policy'}));
 const padded=Math.ceil(meta.length/4)*4,payload=state.bytes.length-40-oldPadded+padded;
 const bytes=new Uint8Array(40+payload);bytes.set(state.bytes.subarray(0,40));bytes.set(meta,40);bytes.set(state.bytes.subarray(40+oldPadded),40+padded);
 const view=new DataView(bytes.buffer);view.setUint32(28,meta.length,true);view.setUint32(32,payload,true);
 const offset=40+padded+4*(state.model.nodeCount*3+1+state.model.edgeCount);
 for(let e=0;e<state.model.edgeCount;e++){const g=state.edgeGroups[e];if(g>=0)view.setFloat32(offset+e*4,state.model.weights[e]*scales[g],true);}
 view.setUint32(36,checksum(bytes.subarray(40)),true);return bytes;
}
