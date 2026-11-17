import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Chess } from '../../src/chess.mjs';
import { chooseBookMove, compileBook } from '../../src/opening-book.mjs';
const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p,root));
const games = read('data/book-sources/selected-games.ndjson').toString().trim().split('\n').map(JSON.parse);
const all = new Map(), slow = new Map(); let replayedPlies=0;
function vote(map,key,move,ply) { if(!map.has(key)) map.set(key,new Map()); const id=move+'@'+ply; map.get(key).set(id,(map.get(key).get(id)||0)+1); }
for(const game of games) {
  const chess=new Chess();
  for(const [ply,san] of game.moves.split(' ').entries()) {
    const key=chess.fen().split(' ').slice(0,4).join(' ');
    const m=chess.move(san,{strict:true}); assert.ok(m); replayedPlies++;
    if(ply<12) { const uci=m.from+m.to+(m.promotion||''); vote(all,key,uci,ply); if(game.speed!=='blitz') vote(slow,key,uci,ply); }
  }
}
const verified={};
for(const [id,expected] of [['lichess-2200',all],['lichess-2200-slow',slow]]) {
  const bytes=read('public/books/'+id+'.json'); const payload=JSON.parse(bytes);
  assert.equal(Object.keys(payload.positions).length,expected.size);
  let continuations=0;
  for(const [key,moves] of expected) { const actual=new Map(payload.positions[key].map(e=>[e.move+'@'+e.ply,e.weight])); assert.deepEqual(actual,moves); continuations+=actual.size; }
  verified[id]={positions:expected.size,continuations,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
const toy=compileBook([{moves:'e4 e5 Nf3 Nc6',weight:1}],{maxPlies:2});
const c=new Chess();c.move('e4');c.move('e5');assert.equal(chooseBookMove(c.fen(),toy),null);
const mate='7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'; assert.equal(chooseBookMove(mate,{maxPlies:12,positions:{}}),null);
const files=['docs/BOOK-SOURCES-V8.md','data/book-sources/SOURCE.json','data/book-sources/STATS.json','data/book-sources/selected-games.ndjson','data/book-sources/evidence/database.txt','data/book-sources/evidence/cc0-1.0-legalcode.txt','data/book-sources/evidence/prefix-response-headers.txt','public/books/manifest.json','public/books/CC0-1.0.txt','public/openings.json','public/books/lichess-2200.json','public/books/lichess-2200-slow.json','src/book-sources.mjs','src/opening-book.mjs','tools/v8-books-fetch.mjs','tools/v8-books-extract.py','tools/v8-books-build.mjs','tools/v8-books-receipt.mjs',...['build','fetch','snapshots','validator'].map(n=>'tests/v8-books-'+n+'.test.mjs'),'tests/test_v8_books_extract.py'];
const result={passed:true,method:'Independent per-game strict Chess replay; does not use compileBook to derive empirical expected positions or weights.',games:games.length,replayedPlies,verified,checks:['Every retained SAN legal, including beyond runtime cutoff','Every serialized empirical FEN/UCI/absolute-ply/game-count weight independently matches source','Cutoff returns null','Terminal position returns null'],sourceHashes:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(read(f)).digest('hex')]))};
writeFileSync(new URL('review-books-independent.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
