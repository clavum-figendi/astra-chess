import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { parseModel } from '../src/network.mjs';
import { chooseMove } from '../src/engine.mjs';
import { scorePuzzle, randomPolicy, greedyPolicy, playGame } from './benchmark-lib.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sampleBytes=readFileSync('.cache/puzzles.json');
const sample=JSON.parse(sampleBytes);
if(sample.puzzles.length!==256) throw new Error('Protocol requires 256 puzzles');
const openings=[['e2e4','e7e5','g1f3','b8c6'],['d2d4','d7d5','c2c4','e7e6'],['e2e4','c7c5','g1f3','d7d6'],['g1f3','d7d5','g2g3','g8f6']];
const results={protocol:'astra-chess-eval-v1',startedAt:new Date().toISOString(),host:{platform:os.platform(),arch:os.arch(),cpus:os.cpus().length,cpu:os.cpus()[0].model,node:process.version},dataset:{...sample,puzzles:undefined,sampleSHA256:hash(sampleBytes)},sourceHashes:Object.fromEntries(['src/network.mjs','src/engine.mjs','tools/benchmark.mjs','tools/benchmark-lib.mjs'].map(p=>[p,hash(readFileSync(p))])),models:[]};
mkdirSync('evaluation',{recursive:true});
for(const id of ['pocket','atlas']) {
  const bytes=readFileSync(`public/models/${id}.bin`);
  const model=parseModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const timings=[];
  const select=fen=>{const start=performance.now();const result=chooseMove(fen,model);timings.push(performance.now()-start);return result.move;};
  const rows=[];
  for(const puzzle of sample.puzzles){rows.push({id:puzzle.id,rating:puzzle.rating,...scorePuzzle(puzzle,select)});}
  const games=[];
  for(const baseline of ['random','greedy']) {
    for(let index=0;index<openings.length;index++) for(const color of ['w','b']) {
      const opponent=baseline==='random'?randomPolicy(811+index):greedyPolicy;
      const game=playGame(color==='w'?select:opponent,color==='w'?opponent:select,openings[index]);
      games.push({baseline,color,openingIndex:index,...game});
    }
  }
  const sorted=timings.toSorted((a,b)=>a-b);
  const summary={id,bytes:bytes.length,sha256:hash(bytes),puzzles:{total:rows.length,firstMoveCorrect:rows.filter(r=>r.firstCorrect).length,fullySolved:rows.filter(r=>r.solved).length,rows},latencyMs:{samples:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)},matches:Object.fromEntries(['random','greedy'].map(baseline=>{const entries=games.filter(g=>g.baseline===baseline);return [baseline,{games:entries.length,wins:entries.filter(g=>g.result===(g.color==='w'?'1-0':'0-1')).length,losses:entries.filter(g=>g.result===(g.color==='w'?'0-1':'1-0')).length,draws:entries.filter(g=>g.result==='1/2-1/2').length,plyLimitDraws:entries.filter(g=>g.termination==='ply-limit').length}]})),games};
  results.models.push(summary);
  if(hash(readFileSync(`public/models/${id}.bin`))!==summary.sha256) throw new Error('Model changed during benchmark');
  writeFileSync(`evaluation/${id}-games.pgn`,games.map(g=>g.pgn).join('\n\n')+'\n');
  writeFileSync('evaluation/results.json',JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({...summary,puzzles:{...summary.puzzles,rows:undefined},games:undefined}));
}
results.finishedAt=new Date().toISOString();
writeFileSync('evaluation/results.json',JSON.stringify(results,null,2)+'\n');
