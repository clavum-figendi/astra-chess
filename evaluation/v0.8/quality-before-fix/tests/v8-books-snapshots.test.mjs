import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildSnapshots } from '../tools/v8-books-build.mjs';
import { validateOpeningBook } from '../src/book-sources.mjs';
import { chooseBookMove, seededRandom, positionKey } from '../src/opening-book.mjs';
import { Chess } from '../src/chess.mjs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const hash=b=>createHash('sha256').update(b).digest('hex');

test('real snapshots rebuild byte-identically offline, preserve counts, license and legal runtime contract',t=>{
  const started=performance.now();
  const rebuilt=buildSnapshots();
  const manifest=JSON.parse(read('public/books/manifest.json'));
  assert.deepEqual(rebuilt.manifest,manifest);
  assert.equal(manifest.default,'eco'); assert.equal(manifest.books.length,3);
  assert.equal(manifest.unavailable[0].id,'masters'); assert.equal(manifest.unavailable[0].available,false);
  assert.deepEqual(read('public/books/CC0-1.0.txt'),read('data/book-sources/evidence/cc0-1.0-legalcode.txt'));
  const source=JSON.parse(read('data/book-sources/SOURCE.json'));
  const games=read('data/book-sources/selected-games.ndjson').toString().trim().split('\n').map(JSON.parse);
  assert.equal(games.length,3000); assert.equal(new Set(games.map(g=>g.id)).size,3000);
  assert.ok(games.every(g=>g.whiteElo>=2200 && g.blackElo>=2200 && ['blitz','rapid','classical'].includes(g.speed)));
  assert.equal(hash(read('data/book-sources/selected-games.ndjson')),source.selectedSha256);
  for(const entry of manifest.books) {
    const bytes=read(new URL(entry.file,new URL('public/books/manifest.json',root)).pathname);
    assert.equal(hash(bytes),entry.sha256);
    const payload=JSON.parse(bytes);
    const start=performance.now(); const runtime=validateOpeningBook(payload);
    t.diagnostic(`${entry.id} full runtime replay ${(performance.now()-start).toFixed(1)}ms; ${bytes.length} bytes`);
    const fen=new Chess().fen();
    assert.ok(chooseBookMove(fen,runtime,{random:seededRandom('real-corpus')}));
    assert.equal(chooseBookMove(fen.replace('0 1','0 20'),runtime),null);
    assert.equal(chooseBookMove(fen.replace(' - ',' e6 '),runtime),null);
    if(entry.id==='eco') continue;
    assert.equal(bytes.toString(),rebuilt.artifacts[entry.file]);
    const selected=entry.id.endsWith('slow')?games.filter(g=>g.speed!=='blitz'):games;
    assert.equal(entry.games,selected.length);
    assert.equal(payload.lines.reduce((s,l)=>s+l.weight,0),selected.length);
    assert.equal(runtime.positions[positionKey(fen)].reduce((s,e)=>s+e.weight,0),selected.length);
    assert.equal(Object.keys(runtime.positions).length,entry.positions);
    // Independent source-game counts for every initial continuation, not named-line votes.
    const expected={};
    for(const game of selected) {
      const chess=new Chess(); const move=chess.move(game.moves.split(' ')[0],{strict:true});
      const uci=move.from+move.to+(move.promotion||''); expected[uci]=(expected[uci]||0)+1;
    }
    assert.deepEqual(Object.fromEntries(runtime.positions[positionKey(fen)].map(e=>[e.move,e.weight])),expected);
  }
  assert.deepEqual(rebuilt.stats,JSON.parse(read('data/book-sources/STATS.json')));
  t.diagnostic(`Offline source replay + all runtime validators: ${(performance.now()-started).toFixed(1)}ms`);
});
