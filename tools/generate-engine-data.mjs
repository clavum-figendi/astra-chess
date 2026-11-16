// Generate real-engine trajectories and complete Stockfish legal-move labels.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Chess} from '../src/chess.mjs';
import {parseModel} from '../src/network.mjs';
import {openEngine} from './uci-engine.mjs';
import {playEngineGame} from './engine-games.mjs';
import {completeLabels} from './engine-labels.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const root='.cache/engine-data';mkdirSync(root,{recursive:true});mkdirSync('evaluation/v0.3',{recursive:true});
export const openings=[
 ['e2e4','e7e5','g1f3','b8c6'],['d2d4','d7d5','c2c4','e7e6'],['e2e4','c7c5','g1f3','d7d6'],['d2d4','g8f6','c2c4','g7g6'],
 ['c2c4','e7e5','b1c3','g8f6'],['g1f3','d7d5','g2g3','g8f6'],['e2e4','e7e6','d2d4','d7d5'],['e2e4','c7c6','d2d4','d7d5'],
 ['b2b3','d7d5','c1b2','g8f6'],['g2g3','d7d5','f1g2','e7e5'],['f2f4','d7d5','g1f3','g8f6'],['b1c3','d7d5','e2e4','d5d4'],
 ['e2e4','d7d5','e4d5','d8d5'],['d2d4','d7d5','g1f3','g8f6'],['c2c4','c7c5','g1f3','g8f6'],['g1f3','g8f6','c2c4','g7g6']
];
for(const line of openings){const b=new Chess();for(const move of line)b.move(move);}
const models={},modelHashes={};
for(const id of ['pocket-plus','atlas-plus']){const bytes=readFileSync(`public/models/${id}.bin`);models[id]=parseModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));modelHashes[id]=hash(bytes);}
const protocol={id:'astra-engine-data-v3',openings,modelHashes,stockfishGameNodes:128,gnuGameDepth:1,teacherDepth:4,maxPlies:120,hashReset:'fresh engine process per game and teacher position',split:'opening group mod4: 0/1 train,2 validation,3 test; both trajectories stay together',samplePerGame:{train:12,validation:8,test:16},boardIdentity:'piece placement and side to move (first two FEN fields)',seed:'engine-tune-v3'};
const protocolSHA=hash(JSON.stringify(protocol));
let games=existsSync(`${root}/games.json`)?JSON.parse(readFileSync(`${root}/games.json`)):[];
if(games.some(g=>g.protocolSHA!==protocolSHA))throw new Error('Existing games use different protocol');
const previous=existsSync('evaluation/v0.3/data-protocol.json')?JSON.parse(readFileSync('evaluation/v0.3/data-protocol.json')):null;
const engines=previous?.protocolSHA===protocolSHA?previous.engines:{},started=performance.now();
const checkBudget=()=>{if(performance.now()-started>7200000)throw new Error('Two-hour generation cap reached; checkpoints saved');};
try{
 for(let group=0;group<openings.length;group++)for(let variant=0;variant<2;variant++){
  const id=`g${group}-${variant}`;if(games.some(g=>g.id===id))continue;
  checkBudget();
  const kind=variant?'gnuchess':'stockfish',modelId=variant?'atlas-plus':'pocket-plus',modelColor=variant?'b':'w';
  const engine=await openEngine({kind});
  engines[kind]={identity:engine.identity,executableSHA256:hash(readFileSync(engine.identity.path)),settings:engine.options.filter(o=>o.value!==undefined)};
  let result;
  try{result=await playEngineGame({model:models[modelId],engine,opening:openings[group],modelColor,limit:kind==='stockfish'?{nodes:128}:{depth:1},maxPlies:120});}finally{await engine.close();}
  games.push({id,group,variant,kind,modelId,modelColor,protocolSHA,...result});
  writeFileSync(`${root}/games.json`,JSON.stringify(games,null,2)+'\n');
  console.log(JSON.stringify({trajectory:id,opponent:kind,result:result.result,termination:result.termination,plies:result.plies}));
 }
 const selected={train:[],validation:[],test:[]},seen=new Set();
 for(const split of ['test','validation','train'])for(const game of games){
  const assigned=game.group%4<2?'train':game.group%4===2?'validation':'test';if(assigned!==split)continue;
  const b=new Chess();b.loadPgn(game.pgn);
  const candidates=b.history({verbose:true}).slice(6).map(m=>m.before).filter(fen=>new Chess(fen).moves().length>1).map(fen=>({fen,key:fen.split(' ').slice(0,2).join(' ')}));
  candidates.sort((a,b)=>hash('engine-tune-v3:'+game.id+':'+a.key).localeCompare(hash('engine-tune-v3:'+game.id+':'+b.key)));
  let used=0;for(const {fen,key} of candidates){if(seen.has(key))continue;seen.add(key);selected[split].push({id:hash(key),fen,group:game.group,trajectory:game.id});if(++used>=protocol.samplePerGame[split])break;}
 }
 for(const [split,min] of [['train',100],['validation',30],['test',60]])if(selected[split].length<min)throw new Error(`Insufficient ${split} positions: ${selected[split].length}`);
 const provenance={protocol,protocolSHA,engines,counts:Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,v.length])),games:games.map(({pgn,modelDecisions,...g})=>g)};
 writeFileSync('evaluation/v0.3/data-protocol.json',JSON.stringify(provenance,null,2)+'\n');
 writeFileSync('evaluation/v0.3/data-games.pgn',games.map(g=>g.pgn).join('\n\n')+'\n');
 for(const split of ['train','validation','test']){
  const path=`${root}/${split}.json`;let labelled=existsSync(path)?JSON.parse(readFileSync(path)):[];
  if(labelled.some(row=>row.protocolSHA!==protocolSHA||!selected[split].some(x=>x.id===row.id)))throw new Error('Existing labels do not match selected split');
  for(const position of selected[split]){
   if(labelled.some(row=>row.id===position.id))continue;
   checkBudget();
   const board=new Chess(position.fen),legal=board.moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||''));
   const teacher=await openEngine({kind:'stockfish'});let analysis;
   try{analysis=await teacher.analyze(position.fen,{depth:4,multiPV:legal.length});}finally{await teacher.close();}
   const moves=completeLabels(position.fen,analysis,4);
   labelled.push({...position,split,protocolSHA,moves});writeFileSync(path,JSON.stringify(labelled)+'\n');
   if(labelled.length%32===0)console.log(JSON.stringify({labelledSplit:split,count:labelled.length}));
  }
  console.log(JSON.stringify({completedSplit:split,count:labelled.length,sha256:hash(readFileSync(path))}));
 }
 provenance.splitSHA256=Object.fromEntries(['train','validation','test'].map(split=>[split,hash(readFileSync(`${root}/${split}.json`))]));
 provenance.finishedAt=new Date().toISOString();provenance.durationMs=performance.now()-started;writeFileSync('evaluation/v0.3/data-protocol.json',JSON.stringify(provenance,null,2)+'\n');
 console.log(JSON.stringify({complete:true,counts:provenance.counts,splitSHA256:provenance.splitSHA256}));
}catch(error){console.error('Data generation stopped; completed games/labels remain checkpointed.');throw error;}
