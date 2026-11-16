// Cache engine-labelled features for optimization; final test requires a frozen selection.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createTuningState,legalFeatures} from './weight-tuning.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const includeTest=process.argv.includes('--include-test');
if(includeTest&&!existsSync('.cache/engine-tuned/selection-frozen.json'))throw new Error('Freeze selected weights before touching test features');
mkdirSync('.cache/engine-features',{recursive:true});
const splits=includeTest?['test']:['train','validation'];
for(const id of ['pocket-plus','atlas-plus']){
 const state=createTuningState(readFileSync(`public/models/${id}.bin`));
 for(const split of splits){
  const path=`.cache/engine-data/${split}.json`,bytes=readFileSync(path),rows=JSON.parse(bytes);
  const positions=rows.map(row=>{
   const labels=new Map(row.moves.map(m=>[m.move,m]));const moves=legalFeatures(row.fen,state);
   if(moves.length!==labels.size||!moves.every(m=>labels.has(m.move)))throw new Error('Teacher/network legal-set disagreement');
   return {id:row.id,fen:row.fen,group:row.group,trajectory:row.trajectory,moves:moves.map(m=>({...m,score:labels.get(m.move).score}))};
  });
  const record={id,split,baseSHA256:state.baseSHA256,labelSHA256:hash(bytes),groups:state.groups,positions};
  const output=`.cache/engine-features/${id}-${split}.json`;writeFileSync(output,JSON.stringify(record)+'\n');
  console.log(JSON.stringify({id,split,positions:positions.length,groups:state.groups.length,featureSHA256:hash(readFileSync(output))}));
 }
}
