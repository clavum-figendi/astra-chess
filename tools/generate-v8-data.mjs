import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Chess} from '../src/chess.mjs';
import {openEngine} from './uci-engine.mjs';
import {teacherPolicy} from './teacher-policy.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),dir='.cache/v8',out='evaluation/v0.8';
mkdirSync(dir,{recursive:true});mkdirSync(out,{recursive:true});
if(existsSync(`${dir}/test-exposed.json`)||existsSync(`${dir}/selection.json`))throw new Error('v8 frozen/test exposed; no dataset changes');
const book=readFileSync(`${dir}/original-openings.json`),byGroup=new Map();
const familySource=readFileSync('.cache/v7/original-openings.json');
const allowedFamilies=new Set(JSON.parse(familySource).lines.map(line=>line.moves.split(' ').slice(0,4).join(' ')));
for(const line of JSON.parse(book).lines){const group=line.moves.split(' ').slice(0,4).join(' ');if(allowedFamilies.has(group)&&!byGroup.has(group))byGroup.set(group,line);}
const groups=[...byGroup.keys()].sort((a,b)=>hash('v8-contrastive-fresh|'+a).localeCompare(hash('v8-contrastive-fresh|'+b))).slice(0,16);
if(groups.length!==16)throw new Error('Expected 16 distinct supported opening families');
const protocol={id:'v8-contrastive-fresh-selection',depth:12,multiPV:4,plies:56,sampleStart:8,sampleEvery:4,groups:groups.map((group,i)=>({group,split:i%2?'test':'validation'})),bookSHA256:hash(book),trajectory:'rank2 when step mod5=3 if within60cp; otherwise bestmove',excludes:'all prior v0.3/v0.4/v0.5/v0.7 board+side IDs',sourceHashes:Object.fromEntries(['tools/generate-v8-data.mjs','tools/teacher-policy.mjs','tools/uci-engine.mjs'].map(p=>[p,hash(readFileSync(p))]))};
protocol.familySourceSHA256=hash(familySource);
const protocolSHA=hash(JSON.stringify(protocol));let games=existsSync(`${dir}/games.json`)?JSON.parse(readFileSync(`${dir}/games.json`)):[];
if(games.some(g=>g.protocolSHA!==protocolSHA))throw new Error('Generation source/protocol changed');
const prior=new Set();
for(const v of ['v0.3','v0.4'])for(const split of ['train','validation','test'])for(const r of JSON.parse(readFileSync(`evaluation/${v}/data/${split}.json`)))prior.add(r.fen.split(' ').slice(0,2).join(' '));
for(const split of ['train','validation','test'])for(const r of JSON.parse(readFileSync(`.cache/deepmind-v5/${split}.json`)))prior.add(r.fen.split(' ').slice(0,2).join(' '));
for(const split of ['validation','test'])for(const r of JSON.parse(readFileSync(`.cache/v7/${split}.json`)))prior.add(r.fen.split(' ').slice(0,2).join(' '));
function save(){
 const seen=new Set(prior),splits={validation:[],test:[]};
 for(const split of ['test','validation'])for(const game of games.filter(g=>g.split===split))for(const row of game.rows){const key=row.fen.split(' ').slice(0,2).join(' ');if(seen.has(key))continue;seen.add(key);splits[split].push(row);}
 for(const [split,rows]of Object.entries(splits))writeFileSync(`${dir}/${split}.json`,JSON.stringify(rows)+'\n');
 const receipt={protocol,protocolSHA,counts:Object.fromEntries(Object.entries(splits).map(([s,r])=>[s,r.length])),splitSHA256:Object.fromEntries(Object.keys(splits).map(s=>[s,hash(readFileSync(`${dir}/${s}.json`))])),games:games.map(({rows,...g})=>g)};
 writeFileSync(`${out}/data-protocol.json`,JSON.stringify(receipt,null,2)+'\n');return receipt;
}
for(let i=0;i<groups.length;i++){
 if(games.some(g=>g.index===i))continue;
 const group=groups[i],split=i%2?'test':'validation',line=byGroup.get(group),board=new Chess(),history=[],rows=[];
 for(const san of line.moves.split(' ').slice(0,8)){const m=board.move(san);history.push(m.from+m.to+(m.promotion||''));}
 const engine=await openEngine({kind:'stockfish'}),identity={...engine.identity,sha256:hash(readFileSync(engine.identity.path))};
 try{for(let step=0;step<56&&!board.isGameOver();step++){
  const fen=board.fen(),analysis=await engine.analyze(fen,{depth:12,multiPV:Math.min(4,board.moves().length),moves:history}),label=teacherPolicy(fen,analysis,12,4);
  if(step>=8&&step%4===0)rows.push({id:hash(fen.split(' ').slice(0,2).join(' ')),fen,group,split,trajectory:i,protocolSHA,...label});
  const best=label.teacher[0],third=label.teacher[1],move=step%5===3&&third&&Number.isFinite(best.cp)&&Number.isFinite(third.cp)&&best.cp-third.cp<=60?third.move:best.move;
  board.move(move);history.push(move);
 }}finally{await engine.close();}
 games.push({index:i,name:line.name,group,split,protocolSHA,engine:identity,rows,pgn:board.pgn()});writeFileSync(`${dir}/games.json`,JSON.stringify(games)+'\n');console.log(JSON.stringify({game:i,...save().counts}),null,0);
}
const receipt=save();for(const count of Object.values(receipt.counts))if(count<48)throw new Error('Insufficient fresh positions');receipt.finishedAt=new Date().toISOString();writeFileSync(`${out}/data-protocol.json`,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({complete:true,counts:receipt.counts}));