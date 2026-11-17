import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseModel,forward} from '../src/network.mjs';
import {chooseMove,encodePosition} from '../src/engine.mjs';
import {Chess} from '../src/chess.mjs';
export function loadBoundModel({file,sha256}){
 const bytes=readFileSync(file);if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error('Model digest mismatch');
 return parseModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}
export function legalScores(fen,model,legal){
 const board=new Chess(fen),actual=board.moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')).sort();
 if(JSON.stringify([...legal].sort())!==JSON.stringify(actual))throw new Error('Full legal mask mismatch');
 const own=board.turn(),square=s=>(own==='w'?Number(s[1])-1:8-Number(s[1]))*8+s.charCodeAt(0)-97;
 const logits=forward(model,encodePosition(fen));
 const scores=legal.map(m=>logits[(square(m.slice(0,2))*64+square(m.slice(2,4)))*5+(m[4]?' qrbn'.indexOf(m[4]):0)]);
 if(scores.some(x=>!Number.isFinite(x)))throw new Error('Non-finite legal score');
 return scores;
}
async function main(){
 if(process.argv.includes('--serve')){
  const models=new Map(),input=createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of input){
   const request=JSON.parse(line),key=request.model.sha256;
   if(!models.has(key))models.set(key,loadBoundModel(request.model));
   console.log(JSON.stringify(chooseMove(request.fen,models.get(key))));
  }
 }else{
  const request=JSON.parse(readFileSync(0,'utf8')),model=loadBoundModel(request.model);
  console.log(JSON.stringify(request.rows.map(row=>{
   const scores=legalScores(row.fen,model,row.legal),ranked=row.legal.map((m,i)=>({move:m,score:scores[i]})).sort((a,b)=>b.score-a.score||a.move.localeCompare(b.move));
   if(ranked[0]?.move!==chooseMove(row.fen,model).move)throw new Error('Deployed ranking mismatch');
   return scores;
  })));
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
