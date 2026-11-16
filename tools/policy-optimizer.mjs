// Full-batch sparse policy distillation; centipawns are never training targets.
import {Chess} from '../src/chess.mjs';
const HARD=.75;
function finite(x,name){if(!Number.isFinite(x))throw new Error(`${name} must be finite`);return x;}
function validateRows(rows,size){
 if(!Array.isArray(rows)||!rows.length)throw new Error('Rows must be a nonempty array');
 const ids=new Set(),boards=new Set();
 for(const r of rows){
  if(typeof r.id!=='string'||!r.id||ids.has(r.id))throw new Error('Invalid or duplicate board id');ids.add(r.id);
  if(typeof r.fen!=='string')throw new Error('Invalid fen');
  const board=new Chess(r.fen),key=board.fen().split(' ').slice(0,4).join(' ');
  if(boards.has(key))throw new Error('Duplicate board position');boards.add(key);
  const legal=new Set(board.moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')));
  if(!legal.has(r.bestmove))throw new Error('Teacher bestmove must be legal');
  if(!Array.isArray(r.moves)||!r.moves.length)throw new Error('Missing moves');
  const moves=new Set(),ranks=new Set();
  for(const m of r.moves){
   if(!legal.has(m.move)||moves.has(m.move))throw new Error('Invalid or duplicate legal move');moves.add(m.move);
   if(!Number.isInteger(m.rank)||m.rank<1||m.rank>legal.size||ranks.has(m.rank))throw new Error('Invalid or duplicate teacher rank');ranks.add(m.rank);
   finite(m.fixed,'fixed');
   if(m.cp!==undefined)finite(m.cp,'cp');if(m.mate!==undefined)finite(m.mate,'mate');
   if(!Array.isArray(m.indices)||!Array.isArray(m.values)||m.indices.length!==m.values.length)throw new Error('Invalid sparse feature arrays');
   const seen=new Set();
   for(let k=0;k<m.indices.length;k++){
    const i=m.indices[k];if(!Number.isInteger(i)||i<0||i>=size||seen.has(i))throw new Error('Invalid or duplicate feature index');seen.add(i);finite(m.values[k],'feature');
   }
  }
  if(!moves.has(r.bestmove)||r.moves.find(m=>m.move===r.bestmove).rank!==1)throw new Error('Teacher bestmove must be present with rank 1');
 }
 return {ids,boards};
}
function target(r){
 const weights=r.moves.map(m=>Math.exp(-(m.rank-1))),sum=weights.reduce((s,v)=>s+v,0);
 return weights.map((v,i)=>(1-HARD)*v/sum+(r.moves[i].move===r.bestmove?HARD:0));
}
function evaluate(rows,scales,gradient){
 let crossEntropy=0,top1=0,teacherRank=0,cpTotal=0,cpCount=0;
 for(const r of rows){
  const scores=r.moves.map(m=>{let s=m.fixed;for(let k=0;k<m.indices.length;k++)s+=m.values[k]*scales[m.indices[k]];return finite(s,'score');});
  const max=Math.max(...scores),exp=scores.map(s=>Math.exp(s-max)),sum=exp.reduce((s,v)=>s+v,0),logSum=Math.log(sum),q=target(r);
  let best=0;for(let i=1;i<scores.length;i++)if(scores[i]>scores[best]||(scores[i]===scores[best]&&r.moves[i].move<r.moves[best].move))best=i;
  const selected=r.moves[best];top1+=Number(selected.move===r.bestmove);teacherRank+=selected.rank;
  if(selected.cp!==undefined){cpTotal+=selected.cp;cpCount++;}
  for(let j=0;j<r.moves.length;j++){
   crossEntropy+=q[j]*(logSum-(scores[j]-max));
   if(gradient){const d=(exp[j]/sum-q[j])/rows.length,m=r.moves[j];for(let k=0;k<m.indices.length;k++)gradient[m.indices[k]]+=d*m.values[k];}
  }
 }
 return {count:rows.length,crossEntropy:finite(crossEntropy/rows.length,'crossEntropy'),top1:top1/rows.length,meanTeacherRank:teacherRank/rows.length,meanSelectedCP:cpCount?cpTotal/cpCount:null};
}
export function measurePolicy(rows,scales){
 if(!Array.isArray(scales)&&!ArrayBuffer.isView(scales))throw new Error('Invalid scales');
 for(const s of scales)finite(s,'scale');validateRows(rows,scales.length);return evaluate(rows,scales);
}
export function fitPolicy({groups,train,validation},options={}){
 if(!Array.isArray(groups)||!groups.length)throw new Error('Groups must be nonempty');
 const keys=new Set();for(const g of groups){
  if(typeof g.key!=='string'||!g.key||keys.has(g.key))throw new Error('Invalid or duplicate group key');keys.add(g.key);
  finite(g.lower,'lower');finite(g.upper,'upper');
  if(typeof g.fixed!=='boolean'||g.lower>1||g.upper<1||g.lower>g.upper||!Number.isInteger(g.edges)||g.edges<1||g.fixed&&(g.lower!==1||g.upper!==1))throw new Error('Invalid group bounds or edges');
 }
 const t=validateRows(train,groups.length),v=validateRows(validation,groups.length);
 if([...t.ids].some(id=>v.ids.has(id))||[...t.boards].some(b=>v.boards.has(b)))throw new Error('Train and validation board IDs/positions must be disjoint');
 const {rounds=6,epochs=150,patience=2,learningRate=.03,onRound}=options;
 for(const [name,value,max] of [['rounds',rounds,6],['epochs',epochs,150],['patience',patience,2]])if(!Number.isInteger(value)||value<1||value>max)throw new Error(`Invalid ${name}: maximum ${max}`);
 if(!Number.isFinite(learningRate)||learningRate<=0||learningRate>1)throw new Error('Invalid learningRate');
 if(onRound!==undefined&&typeof onRound!=='function')throw new Error('Invalid onRound callback');
 const scales=groups.map(()=>1),first=groups.map(()=>0),second=groups.map(()=>0),history=[];
 const metrics=()=>({train:evaluate(train,scales),validation:evaluate(validation,scales)});
 const baseline=metrics();let bestMetrics=baseline,bestScales=[...scales],stale=0,step=0;
 for(let round=1;round<=rounds;round++){
  for(let epoch=0;epoch<epochs;epoch++){
   const gradient=new Float64Array(groups.length);evaluate(train,scales,gradient);step++;
   for(let i=0;i<scales.length;i++)if(!groups[i].fixed){
    const d=finite(gradient[i],'gradient');first[i]=.9*first[i]+.1*d;second[i]=.999*second[i]+.001*d*d;
    finite(second[i],'Adam moment');
    const delta=learningRate*(first[i]/(1-.9**step))/(Math.sqrt(second[i]/(1-.999**step))+1e-8);
    scales[i]=Math.max(groups[i].lower,Math.min(groups[i].upper,finite(scales[i]-delta,'updated scale')));
   }
  }
  const current=metrics(),a=current.validation,b=bestMetrics.validation;
  const improved=a.crossEntropy<b.crossEntropy-1e-12||(Math.abs(a.crossEntropy-b.crossEntropy)<=1e-12&&a.top1>b.top1);
  if(improved){bestMetrics=current;bestScales=[...scales];stale=0;}else stale++;
  const record={round,epochs:round*epochs,scales:[...scales],metrics:current,selected:improved};
  history.push(structuredClone(record));if(onRound)onRound(structuredClone(record));
  if(stale>=patience)break;
 }
 return {baseline,history,scales:bestScales,metrics:bestMetrics};
}
