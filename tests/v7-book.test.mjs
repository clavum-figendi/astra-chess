import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../src/chess.mjs';
import { compileBook, chooseBookMove, seededRandom, positionKey } from '../src/opening-book.mjs';
import { buildOpeningBook, importOpeningLines, sha256 } from '../tools/build-opening-book.mjs';

const bookBytes = readFileSync(new URL('../public/openings.json',import.meta.url));
const book = JSON.parse(bookBytes);
const stats = JSON.parse(readFileSync(new URL('../data/openings/STATS.json',import.meta.url)));
const asUci = m => m.from+m.to+(m.promotion||'');

// Independent original line-by-line implementation: verifies weighted output,
// insertion order and *all* SAN, not merely a sample of opening positions.
function referenceCompile(lines, maxPlies) {
  const positions = {};
  for (const line of lines) {
    const chess = new Chess();
    for (const [ply,san] of line.moves.split(' ').entries()) {
      const key = positionKey(chess.fen());
      const move = asUci(chess.move(san,{strict:true}));
      if (ply>=maxPlies) continue;
      const entries = positions[key] ||= [];
      const existing = entries.find(e=>e.move===move && e.ply===ply);
      if (existing) existing.weight += line.weight;
      else entries.push({move,weight:line.weight,ply});
    }
  }
  return {version:1,maxPlies,lines,positions};
}

test('v7 pinned CC0 sources, deduplication and byte-for-byte offline rebuild', t=>{
  const imported = importOpeningLines();
  assert.equal(imported.source.license,'CC0-1.0');
  assert.match(imported.source.revision,/^[a-f0-9]{40}$/);
  assert.equal(imported.importStats.rows,3865);
  assert.deepEqual(Object.keys(imported.importStats.rowsByVolume),['A','B','C','D','E']);
  assert.equal(book.lines.length,2489);
  assert.ok(book.lines.every(l=>l.weight===1));
  const maximal = new Set(book.lines.map(l=>l.moves));
  for (const moves of maximal) {
    const tokens = moves.split(' ');
    for(let n=1;n<tokens.length;n++) assert.equal(maximal.has(tokens.slice(0,n).join(' ')),false);
  }
  const rebuilt = buildOpeningBook();
  assert.equal(rebuilt.text,bookBytes.toString());
  assert.deepEqual(rebuilt.stats,stats);
  assert.equal(sha256(bookBytes),stats.artifactSha256);
  assert.ok(bookBytes.length<2_000_000);
  assert.ok(rebuilt.compileMs<20_000,`runtime validation took ${rebuilt.compileMs} ms`);
  t.diagnostic(`Full strict trie compile: ${rebuilt.compileMs.toFixed(1)} ms; ${bookBytes.length} bytes`);
});

test('v7 full corpus preserves original compile contract and fully validates beyond cutoff', t=>{
  const started = performance.now();
  assert.deepEqual(referenceCompile(book.lines,book.maxPlies),book);
  t.diagnostic(`Original independent per-line compile: ${(performance.now()-started).toFixed(1)} ms`);
  assert.throws(()=>compileBook([{moves:'e4 e5 Nf3 Nc6 e5',weight:1}],{maxPlies:1}),/illegal|invalid/i);
  const examples = [{moves:'Nf3 d5 d4 Nf6 c4',weight:0.2},{moves:'d4 d5 Nf3 Nf6 g3',weight:0.3},
    {moves:'Nf3 d5 d4 Nf6 c4',weight:0.4},{moves:'e4 a6 e5 d5 exd6',weight:2}];
  assert.deepEqual(compileBook(examples,{maxPlies:32}),referenceCompile(examples,32));
});

test('v7 every stored continuation is legal at its recorded fullmove and depth',t=>{
  let count=0;
  for (const [key,entries] of Object.entries(book.positions)) {
    for(const entry of entries) {
      const fen = `${key} 0 ${Math.floor(entry.ply/2)+1}`;
      const chess = new Chess(fen);
      assert.equal(chess.turn(),entry.ply%2?'b':'w');
      const move=chess.move({from:entry.move.slice(0,2),to:entry.move.slice(2,4),...(entry.move.length===5?{promotion:entry.move[4]}:{})});
      assert.equal(asUci(move),entry.move);
      assert.ok(entry.weight>0 && entry.ply<32);
      count++;
    }
  }
  assert.equal(count,stats.continuations);
  assert.equal(Object.keys(book.positions).length,stats.positions);
  assert.equal(stats.deepestSelectionPly,31);
  assert.equal(stats.longestValidatedLine,36);
  t.diagnostic(`${count} legal continuations at ${stats.positions} positions`);
});

test('v7 seeded variety remains weighted and all ECO volumes offer actual book moves',()=>{
  const start = new Chess().fen();
  const sample = seed => {
    const random = seededRandom(seed);
    return Array.from({length:160},()=>chooseBookMove(start,book,{random}).move);
  };
  assert.deepEqual(sample('v7'),sample('v7'));
  assert.notDeepEqual(sample('v7'),sample('different'));
  assert.ok(new Set(sample('v7')).size>=8);
  const candidates = chooseBookMove(start,book).candidates;
  assert.ok(new Set(candidates.map(c=>c.weight)).size>1);
  assert.equal(candidates.reduce((sum,c)=>sum+c.weight,0),book.lines.length);
  for(const volume of 'ABCDE') {
    const line=book.lines.find(l=>l.eco.startsWith(volume) && l.moves.split(' ').length>8);
    const chess = new Chess();
    for(const san of line.moves.split(' ').slice(0,7)) chess.move(san,{strict:true});
    assert.ok(chooseBookMove(chess.fen(),book,{random:seededRandom(volume)}));
  }
});

test('v7 all 500 ECO codes survive as legal terminal lines or shared prefixes',t=>{
  const representatives = new Map();
  for (const volume of 'abcde') {
    const records = readFileSync(new URL(`../data/openings/${volume}.tsv`,import.meta.url),'utf8').trimEnd().split('\n').slice(1);
    for (const record of records) {
      const [eco,,pgn] = record.split('\t');
      const moves=pgn.split(/\s+/).filter(token=>!/^\d+\.(?:\.\.)?$/.test(token));
      const path=moves.join(' ');
      assert.ok(book.lines.some(line=>line.moves===path || line.moves.startsWith(path+' ')),`${eco} lost named path`);
      if(!representatives.has(eco)) representatives.set(eco,moves);
    }
  }
  assert.equal(representatives.size,500);
  for (const [eco,moves] of representatives) {
    const chess=new Chess();
    const ply=Math.min(moves.length-1,31);
    for(const san of moves.slice(0,ply)) chess.move(san,{strict:true});
    const selected=chooseBookMove(chess.fen(),book,{random:seededRandom(eco)});
    assert.ok(selected,`${eco} has no legal book continuation`);
    assert.ok(chess.move({from:selected.move.slice(0,2),to:selected.move.slice(2,4)}));
  }
  t.diagnostic('All 3,865 source paths retained directly or as validated prefixes; all 500 ECO codes sampled legally');
});

test('v7 imported phantom EP, fullmove, castling, terminal, legal filtering and transpositions',()=>{
  const fen = new Chess().fen();
  assert.equal(chooseBookMove(fen.replace(' - ',' e6 '),book),null);
  assert.equal(chooseBookMove(fen.replace('0 1','0 40'),book),null);
  assert.equal(chooseBookMove(fen.replace('KQkq','-'),book),null);
  assert.equal(chooseBookMove(fen.replace('0 1','100 1'),book),null);
  assert.equal(chooseBookMove(fen,book,{enabled:false}),null);
  assert.equal(chooseBookMove(fen,{...book,positions:{[positionKey(fen)]:[{move:'e2e5',weight:100,ply:0}]}}),null);
  const lines=[{moves:'Nf3 d5 d4 Nf6 c4',weight:2},{moves:'d4 d5 Nf3 Nf6 g3',weight:3}];
  const transposed=compileBook(lines,{maxPlies:32});
  const chess=new Chess();
  for(const move of ['Nf3','d5','d4','Nf6']) chess.move(move);
  assert.deepEqual(chooseBookMove(chess.fen(),transposed).candidates,[{move:'c2c4',weight:2},{move:'g2g3',weight:3}]);
  assert.equal(chooseBookMove(chess.fen().replace(' 3',' 4'),transposed),null);
});
