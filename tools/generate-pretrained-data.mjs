import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {Chess} from '../src/chess.mjs';import {openEngine} from './uci-engine.mjs';import {teacherPolicy} from './teacher-policy.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),dir='.cache/deepmind-v5',out='evaluation/v0.5';mkdirSync(dir,{recursive:true});mkdirSync(out,{recursive:true});
if(existsSync(`${dir}/test-exposed.json`))throw new Error('Test already exposed; refuse data changes');
const book=readFileSync('public/openings.json'),lines=JSON.parse(book).lines;
const protocol={id:'pretrained-adaptation-v5',depth:10,multiPV:4,plies:40,sampleEvery:2,bookSHA256:hash(book),split:'first four SAN plies SHA256 mod6: 0..3 train,4 validation,5 test',trajectory:'fresh engine each trajectory; warm hash within trajectory; rank2 on step%5==1 if within100cp',excludes:'all v0.3 and v0.4 board+side identities',sourceHashes:Object.fromEntries(['tools/generate-pretrained-data.mjs','tools/teacher-policy.mjs','tools/uci-engine.mjs'].map(p=>[p,hash(readFileSync(p))]))};
const protocolSHA=hash(JSON.stringify(protocol));let games=existsSync(`${dir}/games.json`)?JSON.parse(readFileSync(`${dir}/games.json`)):[];if(games.some(g=>g.protocolSHA!==protocolSHA))throw new Error('Generation protocol changed');
const old=new Set();for(const v of ['v0.3','v0.4'])for(const s of ['train','validation','test'])for(const r of JSON.parse(readFileSync(`evaluation/${v}/data/${s}.json`)))old.add(r.fen.split(' ').slice(0,2).join(' '));
function save(){const seen=new Set(old),splits={train:[],validation:[],test:[]};for(const s of ['test','validation','train'])for(const g of games.filter(g=>g.split===s))for(const r of g.rows){const k=r.fen.split(' ').slice(0,2).join(' ');if(seen.has(k))continue;seen.add(k);splits[s].push(r);}for(const [s,rows]of Object.entries(splits))writeFileSync(`${dir}/${s}.json`,JSON.stringify(rows)+'\n');const receipt={protocol,protocolSHA,counts:Object.fromEntries(Object.entries(splits).map(([s,r])=>[s,r.length])),splitSHA256:Object.fromEntries(Object.keys(splits).map(s=>[s,hash(readFileSync(`${dir}/${s}.json`))])),games:games.map(({rows,...g})=>g)};writeFileSync(`${out}/data-protocol.json`,JSON.stringify(receipt,null,2)+'\n');return receipt;}
const start=performance.now();
for(let i=0;i<lines.length;i++){
 if(games.some(g=>g.index===i))continue;if(performance.now()-start>5400000)throw new Error('90-minute generation budget; checkpoints retained');
 const line=lines[i],group=line.moves.split(' ').slice(0,4).join(' '),bucket=parseInt(hash(group).slice(0,8),16)%6,split=bucket<4?'train':bucket===4?'validation':'test';
 const board=new Chess(),history=[],rows=[];for(const san of line.moves.split(' ')){const m=board.move(san);history.push(m.from+m.to+(m.promotion||''));}
 const engine=await openEngine({kind:'stockfish'}),identity={...engine.identity,sha256:hash(readFileSync(engine.identity.path))};
 try{for(let step=0;step<40&&!board.isGameOver();step++){
  const fen=board.fen(),count=Math.min(4,board.moves().length),analysis=await engine.analyze(fen,{depth:10,multiPV:count,moves:history}),label=teacherPolicy(fen,analysis,10,4);
  if(step%2===0)rows.push({id:hash(fen.split(' ').slice(0,2).join(' ')),fen,group,trajectory:i,split,protocolSHA,...label});
  const [best,second]=label.teacher,move=step%5===1&&second&&Number.isFinite(best.cp)&&Number.isFinite(second.cp)&&best.cp-second.cp<=100?second.move:best.move;board.move(move);history.push(move);
 }}finally{await engine.close();}
 games.push({index:i,name:line.name,group,split,protocolSHA,engine:identity,rows,pgn:board.pgn()});writeFileSync(`${dir}/games.json`,JSON.stringify(games)+'\n');const r=save();console.log(JSON.stringify({game:i,counts:r.counts}));
}
const r=save();for(const [s,min]of [['train',150],['validation',50],['test',50]])if(r.counts[s]<min)throw new Error(`Insufficient ${s}`);r.finishedAt=new Date().toISOString();r.durationMs=performance.now()-start;writeFileSync(`${out}/data-protocol.json`,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({complete:true,counts:r.counts}));
