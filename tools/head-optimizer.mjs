// Projected Adam on fixed neural features, using real-engine score distributions.
// Development only: the resulting multipliers are written into the model binary.
function softmax(values){const max=Math.max(...values),exp=values.map(x=>Math.exp(x-max)),sum=exp.reduce((a,b)=>a+b,0);return exp.map(x=>x/sum);}
function pack(rows,width){
 if(!rows.length)throw new Error('Empty position set');
 return rows.map(row=>{
  if(!row.moves?.length)throw new Error('Position has no labelled legal moves');
  const best=Math.max(...row.moves.map(m=>m.score));
  const targets=softmax(row.moves.map(m=>Math.max(-2000,m.score-best)/150));
  return {id:row.id,moves:row.moves.map((m,i)=>{
   if(m.features.length!==width||!Number.isFinite(m.score)||!Number.isFinite(m.fixed)||m.features.some(x=>!Number.isFinite(x)))throw new Error('Invalid labelled feature row');
   const indices=[],values=[];m.features.forEach((x,g)=>{if(x!==0){indices.push(g);values.push(x);}});
   return {...m,indices,values,target:targets[i]};
  }),best};
 });
}
const dot=(m,w)=>{let s=m.fixed;for(let k=0;k<m.indices.length;k++)s+=m.values[k]*w[m.indices[k]];return s;};
function measurePacked(rows,w){
 let loss=0,regret=0,good=0,blunders=0;const regrets=[];
 for(const row of rows){
  const logits=row.moves.map(m=>dot(m,w)),prob=softmax(logits);
  let best=0;for(let j=1;j<logits.length;j++)if(logits[j]>logits[best]||(logits[j]===logits[best]&&row.moves[j].move<row.moves[best].move))best=j;
  const r=Math.min(2000,Math.max(0,row.best-row.moves[best].score));regret+=r;regrets.push(r);if(r<=20)good++;if(r>=200)blunders++;
  for(let j=0;j<prob.length;j++)loss-=row.moves[j].target*Math.log(Math.max(prob[j],1e-300));
 }
 regrets.sort((a,b)=>a-b);
 return {positions:rows.length,crossEntropy:loss/rows.length,meanRegret:regret/rows.length,medianRegret:regrets[Math.floor(regrets.length/2)],within20cp:good/rows.length,blunder200cp:blunders/rows.length};
}
export function measureHead(rows,scales){return measurePacked(pack(rows,scales.length),scales);}
export function optimizeHead(data,{maxRounds=6,epochsPerRound=200,patience=3,learningRate=.04,regularization=.003,onRound=()=>{}}={}){
 const key=row=>row.fen?row.fen.split(' ').slice(0,4).join(' '):row.id;
 const trainKeys=new Set(data.train.map(key));if(data.validation.some(row=>trainKeys.has(key(row))))throw new Error('Training/validation position overlap');
 const width=data.groups.length,train=pack(data.train,width),validation=pack(data.validation,width);
 const w=data.groups.map(()=>1),first=new Float64Array(width),second=new Float64Array(width);
 let bestMetrics=measurePacked(validation,w),bestScales=[...w],bestRound=0,step=0,stale=0,stopReason='round-cap';
 const baseline={train:measurePacked(train,w),validation:bestMetrics};const history=[];
 for(let round=1;round<=maxRounds;round++){
  const lr=learningRate*Math.pow(.7,round-1);let improved=false;
  for(let epoch=1;epoch<=epochsPerRound;epoch++){
   const grad=new Float64Array(width);
   for(const row of train){
    const pred=softmax(row.moves.map(m=>dot(m,w)));
    for(let j=0;j<row.moves.length;j++){
     const m=row.moves[j],error=pred[j]-m.target;
     for(let k=0;k<m.indices.length;k++)grad[m.indices[k]]+=error*m.values[k];
    }
   }
   step++;
   for(let g=0;g<width;g++){
    if(data.groups[g].fixed)continue;
    const gradient=Math.max(-10,Math.min(10,grad[g]/train.length+2*regularization*(w[g]-1)));
    first[g]=.9*first[g]+.1*gradient;second[g]=.999*second[g]+.001*gradient*gradient;
    const update=lr*(first[g]/(1-Math.pow(.9,step)))/(Math.sqrt(second[g]/(1-Math.pow(.999,step)))+1e-8);
    w[g]=Math.max(data.groups[g].lower,Math.min(data.groups[g].upper,w[g]-update));
   }
   if(epoch%20===0||epoch===epochsPerRound){
    const metrics=measurePacked(validation,w);
    if(metrics.meanRegret<=bestMetrics.meanRegret-1){bestMetrics=metrics;bestScales=[...w];bestRound=round;improved=true;}
   }
  }
  stale=improved?0:stale+1;
  const record={round,learningRate:lr,epochs:epochsPerRound,train:measurePacked(train,w),validation:measurePacked(validation,w),scales:[...w],bestMetrics,bestScales:[...bestScales],improved,staleRounds:stale};
  history.push(record);onRound(record);
  if(stale>=patience){stopReason='validation-plateau';break;}
 }
 return {scales:bestScales,bestMetrics,bestRound,baseline,history,stopReason,settings:{maxRounds,epochsPerRound,patience,learningRate,regularization,minimumValidationImprovementCP:1,teacherTemperatureCP:150,regretClipCP:2000}};
}
