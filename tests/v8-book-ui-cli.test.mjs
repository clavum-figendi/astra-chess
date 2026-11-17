import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { compileBook } from '../src/opening-book.mjs';
import { Chess } from '../src/chess.mjs';

async function fixture() {
  const root=await mkdtemp(join(process.env.TMPDIR || '/home/hermes/.hermes/cache/scratch','v8-book-cli-'));
  for(const dir of ['laptop','src','models','books']) await mkdir(join(root,dir),{recursive:true});
  for(const file of ['cli.mjs','protocol.mjs','model-selection.mjs']) await cp(new URL('../laptop/'+file,import.meta.url),join(root,'laptop',file));
  for(const file of ['opening-book.mjs','book-sources.mjs']) await cp(new URL('../src/'+file,import.meta.url),join(root,'src',file));
  await cp(new URL('../node_modules/chess.js/dist/esm/chess.js',import.meta.url),join(root,'src/chess.mjs'));
  await writeFile(join(root,'src/network.mjs'),'export const parseModel=()=>({});');
  await writeFile(join(root,'src/engine.mjs'),"export const chooseMove=()=>({move:'g1f3',candidates:[{move:'g1f3',score:2}],elapsedMs:1});");
  await writeFile(join(root,'models/manifest.json'),JSON.stringify({models:[{id:'pocket-v8',file:'pocket-v8.bin'}]}));
  await writeFile(join(root,'models/pocket-v8.bin'),'fixture');
  const eco=JSON.stringify(compileBook([{moves:'e4 e5'}],{maxPlies:2}));
  const text=JSON.stringify(compileBook([{moves:'d4 d5'}],{maxPlies:2}));
  const hash=createHash('sha256').update(text).digest('hex');
  await writeFile(join(root,'openings.json'),eco); await writeFile(join(root,'books/snapshot.json'),text);
  await writeFile(join(root,'books/manifest.json'),JSON.stringify({version:1,default:'eco',books:[{id:'eco',name:'ECO repertoire',file:'../openings.json'},{id:'snapshot',name:'Snapshot',file:'snapshot.json',sha256:hash}]}));
  const run=(args=[],input)=>spawnSync(process.execPath,[join(root,'laptop/cli.mjs'),'--model','pocket','--seed','replay',...args],{encoding:'utf8',input,timeout:30000});
  return {root,run,hash,close:()=>rm(root,{recursive:true,force:true})};
}
test('packaged CLI selects reproducible profile with SHA provenance and honest policy fallback',async()=>{
  const f=await fixture();
  try {
    const args=['--book-source','snapshot','--fen',new Chess().fen()];
    const result=f.run(args); assert.equal(result.status,0,result.stderr);
    const a=JSON.parse(result.stdout),b=JSON.parse(f.run(args).stdout);
    assert.equal(a.move,'d2d4'); assert.equal(a.bookSource,'snapshot'); assert.equal(a.bookSHA256,f.hash); assert.equal(a.move,b.move); assert.equal(a.seed,'replay');
    assert.equal(JSON.parse(f.run(['--fen',new Chess().fen()]).stdout).move,'e2e4');
    const off=JSON.parse(f.run([...args,'--no-book']).stdout); assert.equal(off.source,'policy'); assert.equal(off.book,false); assert.equal(off.bookSource,'snapshot');
    const ep=JSON.parse(f.run(['--book-source','snapshot','--fen',new Chess().fen().replace(' - ',' e6 ')]).stdout); assert.equal(ep.source,'policy');
    const late=JSON.parse(f.run(['--book-source','snapshot','--fen',new Chess().fen().replace('0 1','0 20')]).stdout); assert.equal(late.source,'policy');
  } finally {await f.close();}
});
test('CLI rejects unknown profiles, corrupted hashes, and missing flag values',async()=>{
  const f=await fixture();
  try {
    for(const args of [['--book-source','unknown'],['--book-source']]) {const r=f.run(args); assert.notEqual(r.status,0);assert.match(r.stderr,/book-source|book.*source/i);}
    await writeFile(join(f.root,'books/snapshot.json'),'{}');
    const bad=f.run(['--book-source','snapshot','--fen',new Chess().fen()]); assert.notEqual(bad.status,0); assert.match(bad.stderr,/SHA256.*mismatch/i);
  } finally {await f.close();}
});
test('UCI BookSource resets the position and seed, reports provenance, and rejects unknown IDs',async()=>{
  const f=await fixture();
  try {
    const r=f.run([], 'uci\nposition startpos moves e2e4\nsetoption name BookSource value snapshot\ngo\nucinewgame\ngo\nsetoption name BookSource value unknown\ngo\nsetoption name BookSource value eco\ngo\nposition startpos moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8\ngo\nquit\n');
    assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/option name BookSource type combo default eco var eco var snapshot/);
    assert.match(r.stdout,/bookSource snapshot.*bookSHA256 [a-f0-9]{64}/);
    const moves=[...r.stdout.matchAll(/bestmove (\w+)/g)].map(m=>m[1]);
    assert.deepEqual(moves,['d2d4','d2d4','e2e4','0000']);
    assert.match(r.stdout,/info string error Unknown opening-book source/);
    const malformed=f.run([], 'setoption name BookSource value invalid profile\ngo\nquit\n');
    assert.match(malformed.stdout,/info string error Invalid opening-book source/);
    assert.doesNotMatch(malformed.stdout,/bestmove/);
  } finally {await f.close();}
});
