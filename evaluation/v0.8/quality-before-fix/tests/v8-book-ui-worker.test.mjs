import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Chess } from '../src/chess.mjs';
import { compileBook } from '../src/opening-book.mjs';

const scratch = process.env.TMPDIR || '/home/hermes/.hermes/cache/scratch';
const sha = text => createHash('sha256').update(text).digest('hex');
async function harness({file='snapshot.json', hash, delayed=false}={}) {
  const root = await mkdtemp(join(scratch,'v8-book-worker-'));
  await mkdir(join(root,'project/src'),{recursive:true});
  await cp(new URL('../public/worker.mjs',import.meta.url),join(root,'project/worker.mjs'));
  for (const file of ['opening-book.mjs','book-sources.mjs']) await cp(new URL('../src/'+file,import.meta.url),join(root,'project/src',file));
  const validatorPath = join(root,'project/src/book-sources.mjs');
  await writeFile(validatorPath,(await readFile(validatorPath,'utf8')).replace('export function validateOpeningBook(payload) {','export function validateOpeningBook(payload) { globalThis.validations = (globalThis.validations || 0) + 1;'));
  await cp(new URL('../node_modules/chess.js/dist/esm/chess.js',import.meta.url),join(root,'project/src/chess.mjs'));
  await writeFile(join(root,'project/src/model-resource.mjs'),`export const modelResourceURL=(m,b)=>new URL(m.file,b); export const verifyModelBuffer=async()=>{};`);
  await writeFile(join(root,'project/src/network.mjs'),`export const parseModel=()=>({});`);
  await writeFile(join(root,'project/src/engine.mjs'),`export const chooseMove=()=>({move:'g1f3',candidates:[{move:'g1f3',score:1}],elapsedMs:1});`);
  const text=JSON.stringify(compileBook([{moves:'d4 d5',weight:1}],{maxPlies:2}));
  const registry={version:1,default:'eco',books:[{id:'eco',name:'ECO repertoire',file:'../openings.json'},{id:'snapshot',name:'Offline snapshot',file,sha256:hash ?? sha(text)}]};
  const worker=new Worker(`
    const {parentPort}=require('node:worker_threads');
    globalThis.self=globalThis; globalThis.postMessage=data=>parentPort.postMessage(data);
    const counts={}; const text=${JSON.stringify(text)}; let compiled=new Map();
    globalThis.caches={open:async()=>({match:async key=>compiled.get(String(key))?.clone(),put:async(key,response)=>{compiled.set(String(key),response.clone());}})};
    globalThis.fetch=async url=>{
      const path=new URL(url).pathname; counts[path]=(counts[path]||0)+1;
      if (${delayed} && path.endsWith('/snapshot.json')) await new Promise(r=>setTimeout(r,100));
      let body=path.endsWith('/books/manifest.json')?JSON.stringify(${JSON.stringify(registry)}):path.endsWith('/models/manifest.json')?JSON.stringify({models:[{id:'pocket',file:'pocket.bin'}]}):path.endsWith('.bin')?'bytes':path.endsWith('/openings.json')?JSON.stringify(${JSON.stringify(compileBook([{moves:'e4 e5'}],{maxPlies:2}))}):text;
      return new Response(body);
    };
    const url=${JSON.stringify(pathToFileURL(join(root,'project/worker.mjs')).href)};
    import(url).then(()=>{parentPort.on('message',async data=>{
      if(data.type==='counts') parentPort.postMessage({counts,validations:globalThis.validations});
      else if(data.type==='corrupt-cache') {for(const [key,response] of compiled){const book=await response.clone().json();book.positions={};compiled.set(key,new Response(JSON.stringify(book),{headers:response.headers}));}parentPort.postMessage({corrupted:true});}
      else if(data.type==='reload') {await import(url+'?fresh=1'); parentPort.postMessage({reloaded:true});}
      else self.onmessage({data});
    });parentPort.postMessage({ready:true});});
  `,{eval:true});
  const queue=[],waiters=[];
  worker.on('message',data=>waiters.length?waiters.shift()(data):queue.push(data));
  const receive=()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{waiters.push(resolve);worker.once('error',reject);});
  assert.equal((await receive()).ready,true);
  let id=0;
  const ask=data=>{worker.postMessage({id:String(++id),...data});return receive();};
  return {worker,ask,receive,close:async()=>{await worker.terminate();await rm(root,{recursive:true,force:true});},hash:sha(text)};
}

test('worker chooses selected offline profile, reports provenance and reuses validated cache',async()=>{
  const h=await harness();
  try {
    const config={enabled:true,source:'snapshot',seed:'repeat'};
    const loaded=await h.ask({type:'load',modelId:'pocket',book:config});
    assert.equal(loaded.type,'loaded',loaded.error); assert.equal(loaded.bookSource,'snapshot'); assert.equal(loaded.bookSHA256,h.hash);
    const a=await h.ask({type:'move',fen:new Chess().fen()});
    assert.equal(a.source,'book'); assert.equal(a.move,'d2d4'); assert.equal(a.bookSource,'snapshot'); assert.equal(a.bookSHA256,h.hash);
    assert.ok(a.candidates.every(c=>!('score' in c)));
    const again=await h.ask({type:'load',modelId:'pocket',book:config}); assert.equal(again.type,'loaded',again.error);
    const b=await h.ask({type:'move',fen:new Chess().fen()}); assert.equal(a.move,b.move);
    const counts=await h.ask({type:'counts'}); assert.equal(Object.entries(counts.counts).find(([p])=>p.endsWith('/snapshot.json'))[1],1);
    assert.equal(counts.validations,1);
    assert.equal((await h.ask({type:'reload'})).reloaded,true);
    assert.equal((await h.ask({type:'load',modelId:'pocket',book:config})).type,'loaded');
    assert.equal((await h.ask({type:'counts'})).validations,1,'validated local cache must survive a fresh worker module');
    const miss=await h.ask({type:'move',fen:new Chess().fen().replace('0 1','0 30')});
    assert.equal(miss.source,'policy'); assert.equal(miss.bookSource,'snapshot'); assert.equal(miss.candidates[0].score,1);
  } finally {await h.close();}
});

test('worker rejects unknown IDs, unsafe asset paths and incorrect SHA without ECO fallback',async()=>{
  for(const options of [{},{file:'../snapshot.json'},{file:'https://example.com/book.json'},{file:'%2e%2e/book.json'},{hash:'0'.repeat(64)}]) {
    const h=await harness(options);
    try {
      const answer=await h.ask({type:'load',modelId:'pocket',book:{source:Object.keys(options).length?'snapshot':'unknown',seed:'x'}});
      assert.equal(answer.type,'error'); assert.match(answer.error,/book|SHA|hash|path/i);
      assert.equal((await h.ask({type:'move',fen:new Chess().fen()})).type,'error');
    } finally {await h.close();}
  }
});

test('valid-shaped cache corruption is rebuilt from verified source bytes',async()=>{
  const h=await harness();
  try {
    const config={enabled:true,source:'snapshot',seed:'repeat'};
    assert.equal((await h.ask({type:'load',modelId:'pocket',book:config})).type,'loaded');
    assert.equal((await h.ask({type:'corrupt-cache'})).corrupted,true);
    assert.equal((await h.ask({type:'reload'})).reloaded,true);
    assert.equal((await h.ask({type:'load',modelId:'pocket',book:config})).type,'loaded');
    const move=await h.ask({type:'move',fen:new Chess().fen()});
    assert.equal(move.source,'book');assert.equal(move.move,'d2d4');
    assert.equal((await h.ask({type:'counts'})).validations,2);
  }finally{await h.close();}
});

test('superseded profile loads cannot replace a newer game',async()=>{
  const h=await harness({delayed:true});
  try {
    h.worker.postMessage({type:'load',id:'old',modelId:'pocket',book:{source:'snapshot',seed:'old'}});
    await new Promise(r=>setTimeout(r,30));
    h.worker.postMessage({type:'load',id:'new',modelId:'pocket',book:{source:'eco',seed:'new'}});
    const replies=[await h.receive(),await h.receive()];
    assert.equal(replies.find(r=>r.id==='old').type,'error');
    assert.equal(replies.find(r=>r.id==='new').type,'loaded');
    const move=await h.ask({type:'move',fen:new Chess().fen()});
    assert.equal(move.bookSource,'eco'); assert.equal(move.seed,'new'); assert.equal(move.move,'e2e4');
  } finally {await h.close();}
});
