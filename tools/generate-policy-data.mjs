import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Chess} from '../src/chess.mjs';
import {openEngine} from './uci-engine.mjs';
import {policyLabels} from './policy-labels.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),dir='.cache/policy-v4';mkdirSync(dir,{recursive:true});mkdirSync('evaluation/v0.4',{recursive:true});
if(existsSync(`${dir}/test-exposed.json`))throw new Error('Final test exposed: start a new experiment');
const bookBytes=readFileSync('public/openings.json'),lines=JSON.parse(bookBytes).lines;
const protocol={id:'policy-v4',bookSHA256:hash(bookBytes),depth:6,pliesPerTrajectory:40,sampleEvery:2,split:'SHA256(first four SAN plies) mod6: 0..3 train,4 validation,5 test',trajectory:'Stockfish bestmove, except every fifth move rank2 when within80cp; fresh process per opening, warm hash within trajectory',priorV3PositionsExcluded:true,sourceHashes:Object.fromEntries(['tools/generate-policy-data.mjs','tools/policy-labels.mjs','tools/uci-engine.mjs'].map(p=>[p,hash(readFileSync(p))]))};
const protocolSHA=hash(JSON.stringify(protocol));
let games=existsSync(`${dir}/games.json`)?JSON.parse(readFileSync(`${dir}/games.json`)):[];
if(games.some(g=>g.protocolSHA!==protocolSHA))throw new Error('Changed generation protocol');
const old=new Set(['train','validation','test'].flatMap(s=>JSON.parse(readFileSync(`evaluation/v0.3/data/${s}.json`)).map(r=>r.fen.split(' ').slice(0,2).join(' '))));
function exportData(){
 const seen=new Set(old),splits={train:[],validation:[],test:[]};
 for(const split of ['test','validation','train'])for(const g of games.filter(g=>g.split===split))for(const r of g.rows){const key=r.fen.split(' ').slice(0,2).join(' ');if(seen.has(key))continue;seen.add(key);splits[split].push(r);}
 for(const [split,rows]of Object.entries(splits))writeFileSync(`${dir}/${split}.json`,JSON.stringify(rows)+'\n');
 const receipt={protocol,protocolSHA,counts:Object.fromEntries(Object.entries(splits).map(([s,rows])=>[s,rows.length])),games:games.map(({rows,...g})=>g),splitSHA256:Object.fromEntries(Object.keys(splits).map(s=>[s,hash(readFileSync(`${dir}/${s}.json`))]))};
 writeFileSync('evaluation/v0.4/data-protocol.json',JSON.stringify(receipt,null,2)+'\n');return receipt;
}
const started=performance.now();
for(let index=0;index<lines.length;index++){
 if(games.some(g=>g.index===index))continue;
 if(performance.now()-started>5400000)throw new Error('90-minute local generation cap reached; checkpoints retained');
 const opening=lines[index],group=opening.moves.split(' ').slice(0,4).join(' '),bucket=parseInt(hash(group).slice(0,8),16)%6,split=bucket<4?'train':bucket===4?'validation':'test';
 const board=new Chess(),history=[];for(const san of opening.moves.split(' ')){const m=board.move(san);history.push(m.from+m.to+(m.promotion||''));}
 const engine=await openEngine({kind:'stockfish'}),engineInfo={identity:engine.identity,sha256:hash(readFileSync(engine.identity.path)),options:engine.options.filter(o=>o.value!==undefined)};const rows=[];
 try{
  for(let step=0;step<40&&!board.isGameOver();step++){
   const fen=board.fen(),legal=board.moves();if(legal.length===1){const m=board.move(legal[0]);history.push(m.from+m.to+(m.promotion||''));continue;}
   const analysis=await engine.analyze(fen,{depth:6,multiPV:legal.length,moves:history}),labels=policyLabels(fen,analysis,6);
   if(step%2===0)rows.push({id:hash(fen.split(' ').slice(0,2).join(' ')),fen,group,trajectory:index,split,protocolSHA,...labels});
   const first=labels.moves.find(m=>m.rank===1),second=labels.moves.find(m=>m.rank===2);
   const chosen=step%5===4&&second&&Number.isFinite(first.cp)&&Number.isFinite(second.cp)&&first.cp-second.cp<=80?second.move:labels.bestmove;
   board.move(chosen);history.push(chosen);
  }
 }finally{await engine.close();}
 games.push({index,name:opening.name,group,split,protocolSHA,engine:engineInfo,pgn:board.pgn(),rows});
 writeFileSync(`${dir}/games.json`,JSON.stringify(games)+'\n');const r=exportData();console.log(JSON.stringify({trajectory:index,split,positions:rows.length,counts:r.counts}));
}
const receipt=exportData();receipt.finishedAt=new Date().toISOString();receipt.durationMs=performance.now()-started;
for(const [s,min] of [['train',200],['validation',60],['test',60]])if(receipt.counts[s]<min)throw new Error(`Insufficient ${s} data`);
writeFileSync('evaluation/v0.4/data-protocol.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({complete:true,counts:receipt.counts}));
