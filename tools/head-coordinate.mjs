// A second, bounded optimization strategy: direct training-regret coordinate search.
import {measureHead} from './head-optimizer.mjs';
export function coordinateHead(data,initial,passes=2){
 if(initial.length!==data.groups.length||passes<1||passes>2)throw new Error('Invalid coordinate budget');
 const ids=new Set(data.train.map(p=>p.id));if(data.validation.some(p=>ids.has(p.id)))throw new Error('Training/validation overlap');
 const w=[...initial],scores=data.train.map(p=>p.moves.map(m=>m.fixed+m.features.reduce((s,x,g)=>s+x*w[g],0)));
 const best=data.train.map(p=>Math.max(...p.moves.map(m=>m.score)));
 const regret=(group,delta)=>{
  let total=0;
  for(let p=0;p<data.train.length;p++){
   const moves=data.train[p].moves;let chosen=0,value=-Infinity;
   for(let j=0;j<moves.length;j++){const score=scores[p][j]+delta*moves[j].features[group];if(score>value||(score===value&&moves[j].move<moves[chosen].move)){chosen=j;value=score;}}
   total+=Math.min(2000,Math.max(0,best[p]-moves[chosen].score));
  }
  return total/data.train.length;
 };
 const history=[];
 for(let pass=1;pass<=passes;pass++){
  let changes=0;
  for(let g=0;g<w.length;g++){
   if(data.groups[g].fixed)continue;
   const current=w[g];let selected=current,objective=regret(g,0)+.1*(current-1)**2;
   const choices=[.05,.25,.5,.75,1,1.5,2,3,4,current*.8,current*1.2];
   for(const value of choices){
    if(value<data.groups[g].lower||value>data.groups[g].upper)continue;
    const loss=regret(g,value-current)+.1*(value-1)**2;
    if(loss<objective-1e-9){objective=loss;selected=value;}
   }
   if(selected!==current){w[g]=selected;changes++;for(let p=0;p<data.train.length;p++)for(let j=0;j<scores[p].length;j++)scores[p][j]+=(selected-current)*data.train[p].moves[j].features[g];}
  }
  history.push({pass,changes,scales:[...w],train:measureHead(data.train,w),validation:measureHead(data.validation,w)});
 }
 return {scales:w,history,stopReason:'two-pass-alternative-budget',grid:[.05,.25,.5,.75,1,1.5,2,3,4],priorPenaltyCP:.1};
}
