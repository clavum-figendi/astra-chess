// Final frozen-model evaluation. This file must not feed the optimizer.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {parseModel} from '../src/network.mjs';
import {chooseMove} from '../src/engine.mjs';
import {openEngine} from './uci-engine.mjs';
import {playEngineGame} from './engine-games.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const directory='evaluation/v0.3';mkdirSync(directory,{recursive:true});
const selectionBytes=readFileSync('.cache/engine-tuned/selection-frozen.json'),selection=JSON.parse(selectionBytes);
if(hash(readFileSync(`${directory}/optimization.json`))!==selection.optimizationSHA256)throw new Error('Frozen selection no longer matches optimization record');
const dataProtocol=JSON.parse(readFileSync(`${directory}/data-protocol.json`));
const testBytes=readFileSync('.cache/engine-data/test.json');
if(hash(testBytes)!==dataProtocol.splitSHA256.test)throw new Error('Final-test labels changed');
const labels=JSON.parse(testBytes),ids=['pocket','pocket-plus','pocket-tuned','atlas','atlas-plus','atlas-tuned'];
const models={},modelHashes={},modelPaths={};
for(const id of ids){
 const tuned=selection.models.find(m=>m.id===id),path=tuned?tuned.path:`public/models/${id}.bin`,bytes=readFileSync(path);
 if(tuned&&hash(bytes)!==tuned.sha256)throw new Error('Selected binary changed');
 models[id]=parseModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));modelHashes[id]=hash(bytes);modelPaths[id]=path;
}
const starts=dataProtocol.protocol.openings.map((opening,group)=>({opening,group})).filter(x=>x.group%4===3);
const protocols=[{id:'stockfish-n128',kind:'stockfish',limit:{nodes:128},starts},{id:'gnuchess-d1',kind:'gnuchess',limit:{depth:1},starts},{id:'stockfish-d3-stress',kind:'stockfish',limit:{depth:3},starts:[starts[0],starts.at(-1)]}];
const sourceHashes=Object.fromEntries(['tools/evaluate-engine-tuned.mjs','tools/uci-engine.mjs','tools/engine-games.mjs','src/engine.mjs','src/network.mjs'].map(p=>[p,hash(readFileSync(p))]));
const protocol={id:'astra-real-engine-test-v3',modelHashes,sourceHashes,selectionSHA256:hash(selectionBytes),testLabelsSHA256:hash(testBytes),limits:protocols,maxPlies:160,hashReset:'fresh process for each game',scoreConvention:'side-to-move teacher scores; mate surrogate separate; regret clipped at 2000; no Elo inference'};
const protocolSHA=hash(JSON.stringify(protocol));
const output=`${directory}/engine-results.json`;
const result=existsSync(output)?JSON.parse(readFileSync(output)):{protocol,protocolSHA,startedAt:new Date().toISOString(),host:{platform:os.platform(),cpu:os.cpus()[0].model,cpus:os.cpus().length,node:process.version},positionResults:[],games:[]};
if(result.protocolSHA!==protocolSHA)throw new Error('Existing evaluation uses another frozen protocol');
const save=()=>writeFileSync(output,JSON.stringify(result,null,2)+'\n');
for(const id of ids){
 if(result.positionResults.some(r=>r.id===id))continue;
 let sum=0,good=0,blunders=0;const rows=[];
 for(const row of labels){
  const chosen=chooseMove(row.fen,models[id]),target=row.moves.find(m=>m.move===chosen.move);if(!target)throw new Error('Illegal model prediction');
  const best=Math.max(...row.moves.map(m=>m.score)),regret=Math.min(2000,Math.max(0,best-target.score));sum+=regret;if(regret<=20)good++;if(regret>=200)blunders++;
  rows.push({id:row.id,move:chosen.move,teacherScore:target.score,bestTeacherScore:best,regret,elapsedMs:chosen.elapsedMs});
 }
 const record={id,sha256:modelHashes[id],positions:rows.length,meanRegret:sum/rows.length,within20cp:good/rows.length,blunder200cp:blunders/rows.length,rows};
 result.positionResults.push(record);save();console.log(JSON.stringify({...record,rows:undefined}));
}
const started=performance.now();
for(const setting of protocols)for(const start of setting.starts)for(const color of ['w','b'])for(const id of ids){
 const key=`${setting.id}/${start.group}/${color}/${id}`;if(result.games.some(g=>g.key===key))continue;
 if(performance.now()-started>7200000)throw new Error('Tournament two-hour cap reached; partial records saved');
 const engine=await openEngine({kind:setting.kind});let game;
 const engineRecord={identity:engine.identity,sha256:hash(readFileSync(engine.identity.path)),settings:engine.options.filter(o=>o.value!==undefined)};
 try{game=await playEngineGame({model:models[id],engine,opening:start.opening,modelColor:color,limit:setting.limit,maxPlies:160});}finally{await engine.close();}
 result.games.push({key,id,modelColor:color,setting:setting.id,openingGroup:start.group,limit:setting.limit,engine:engineRecord,...game});save();
 console.log(JSON.stringify({game:key,result:game.result,termination:game.termination,plies:game.plies}));
}
result.summaries=[];
for(const id of ids)for(const setting of protocols){
 const games=result.games.filter(g=>g.id===id&&g.setting===setting.id),wins=games.filter(g=>g.result===(g.modelColor==='w'?'1-0':'0-1')).length,draws=games.filter(g=>g.result==='1/2-1/2').length;
 result.summaries.push({id,setting:setting.id,games:games.length,wins,draws,losses:games.length-wins-draws,plyCapDraws:games.filter(g=>g.termination==='ply-cap').length,score:wins+draws/2});
}
for(const id of ids)if(hash(readFileSync(modelPaths[id]))!==modelHashes[id])throw new Error('Weights changed during final test');
for(const [path,digest]of Object.entries(sourceHashes))if(hash(readFileSync(path))!==digest)throw new Error('Evaluator source changed during final test');
result.finishedAt=new Date().toISOString();save();
writeFileSync(`${directory}/engine-matches.pgn`,result.games.map(g=>g.pgn).join('\n\n')+'\n');
console.log(JSON.stringify({finished:true,summaries:result.summaries}));
