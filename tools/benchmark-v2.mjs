import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {parseModel} from '../src/network.mjs';
import {chooseMove} from '../src/engine.mjs';
import {scorePuzzle,randomPolicy,greedyPolicy,playGame} from './benchmark-lib.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const ids=['pocket','pocket-plus','atlas','atlas-plus'];
const sampleBytes=readFileSync('.cache/puzzles-v2.json'),sample=JSON.parse(sampleBytes);
if(sample.puzzles.length!==256)throw new Error('Protocol requires 256 puzzles');
const openings=[['e2e4','e7e5','g1f3','b8c6'],['d2d4','d7d5','c2c4','e7e6'],['e2e4','c7c5','g1f3','d7d6'],['g1f3','d7d5','g2g3','g8f6']];
const directory='evaluation/v0.2';mkdirSync(directory,{recursive:true});
const sources=['src/network.mjs','src/engine.mjs','tools/compile-models.mjs','tools/endgame-circuits.mjs','tools/benchmark-v2.mjs','tools/benchmark-lib.mjs'];
const result={protocol:'astra-chess-eval-v2',startedAt:new Date().toISOString(),host:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,cpus:os.cpus().length,node:process.version},dataset:{...sample,puzzles:undefined,sampleSHA256:hash(sampleBytes)},sourceHashes:Object.fromEntries(sources.map(p=>[p,hash(readFileSync(p))])),models:[],headToHead:[]};
const selectors={},loaded={};
const save=()=>writeFileSync(`${directory}/results.json`,JSON.stringify(result,null,2)+'\n');
for(const id of ids){
  const bytes=readFileSync(`public/models/${id}.bin`);const model=parseModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const times=[];const select=fen=>{const t=performance.now();const choice=chooseMove(fen,model).move;times.push(performance.now()-t);return choice;};
  selectors[id]=select;loaded[id]=hash(bytes);
  const rows=sample.puzzles.map(p=>({id:p.id,rating:p.rating,...scorePuzzle(p,select)}));
  const games=[];
  for(const opponent of ['random','greedy'])for(let i=0;i<openings.length;i++)for(const color of ['w','b']){
    const baseline=opponent==='random'?randomPolicy(811+i):greedyPolicy;
    games.push({opponent,color,openingIndex:i,...playGame(color==='w'?select:baseline,color==='w'?baseline:select,openings[i])});
  }
  const timing=times.toSorted((a,b)=>a-b);
  const summary={id,bytes:bytes.length,sha256:loaded[id],puzzles:{total:rows.length,firstMoveCorrect:rows.filter(r=>r.firstCorrect).length,fullySolved:rows.filter(r=>r.solved).length,rows},latencyMs:{samples:timing.length,median:timing[Math.floor(timing.length*.5)],p95:timing[Math.floor(timing.length*.95)]},matches:Object.fromEntries(['random','greedy'].map(opponent=>{const g=games.filter(g=>g.opponent===opponent);return [opponent,{games:g.length,wins:g.filter(g=>g.result===(g.color==='w'?'1-0':'0-1')).length,losses:g.filter(g=>g.result===(g.color==='w'?'0-1':'1-0')).length,draws:g.filter(g=>g.result==='1/2-1/2').length,stalemates:g.filter(g=>g.termination==='stalemate').length,plyLimitDraws:g.filter(g=>g.termination==='ply-limit').length}]})),games};
  result.models.push(summary);save();
  writeFileSync(`${directory}/${id}-games.pgn`,games.map(g=>g.pgn).join('\n\n')+'\n');
  console.log(JSON.stringify({...summary,puzzles:{...summary.puzzles,rows:undefined},games:undefined}));
}
for(const base of ['pocket','atlas']){
  const plus=base+'-plus';const games=[];
  for(let i=0;i<openings.length;i++)for(const color of ['w','b'])games.push({plusColor:color,openingIndex:i,...playGame(selectors[color==='w'?plus:base],selectors[color==='w'?base:plus],openings[i])});
  const summary={base,plus,games:games.length,plusWins:games.filter(g=>g.result===(g.plusColor==='w'?'1-0':'0-1')).length,plusLosses:games.filter(g=>g.result===(g.plusColor==='w'?'0-1':'1-0')).length,draws:games.filter(g=>g.result==='1/2-1/2').length,plyLimitDraws:games.filter(g=>g.termination==='ply-limit').length,records:games};
  result.headToHead.push(summary);save();console.log(JSON.stringify({...summary,records:undefined}));
  writeFileSync(`${directory}/${plus}-versus-classic.pgn`,games.map(g=>g.pgn).join('\n\n')+'\n');
}
for(const id of ids)if(hash(readFileSync(`public/models/${id}.bin`))!==loaded[id])throw new Error('Model changed during run');
for(const [path,digest]of Object.entries(result.sourceHashes))if(hash(readFileSync(path))!==digest)throw new Error('Source changed during run');
result.finishedAt=new Date().toISOString();save();
