import test from 'node:test';
import assert from 'node:assert/strict';
import { compileBook, chooseBookMove, seededRandom } from '../src/opening-book.mjs';
import { Chess } from '../src/chess.mjs';
import * as sources from '../src/book-sources.mjs';

test('validator returns the replayed runtime book, not trusted serialized positions',()=>{
  assert.equal(typeof sources.validateOpeningBook,'function');
  const payload=compileBook([{moves:'e4 e5 Nf3 Nc6',weight:3},{moves:'d4 d5',weight:2}],{maxPlies:24});
  assert.deepEqual(sources.validateOpeningBook(payload),{maxPlies:24,positions:payload.positions});
});

test('validator rejects malformed, illegal, truncated or tampered payloads',()=>{
  const valid=compileBook([{moves:'e4 e5 Nf3 Nc6',weight:3}],{maxPlies:24});
  for(const payload of [null,{}, {...valid,version:2}, {...valid,maxPlies:0}, {...valid,maxPlies:65},
    {...valid,lines:[]}, {...valid,lines:[{moves:'e4 e5 e5',weight:1}]},
    {...valid,lines:[{moves:'e4',weight:0}]}, {...valid,positions:{}},
    {...valid,lines:[{moves:'e4',weight:3}]},
    {...valid,positions:{...valid.positions,illegal:[{move:'a1a8',weight:1,ply:0}]}}]) {
      assert.throws(()=>sources.validateOpeningBook(payload));
  }
  const altered=structuredClone(valid); Object.values(altered.positions)[0][0].weight++;
  assert.throws(()=>sources.validateOpeningBook(altered));
  const ep=structuredClone(valid); const key=Object.keys(ep.positions)[1];
  ep.positions[key.replace(' -',' e3')]=ep.positions[key]; delete ep.positions[key];
  assert.throws(()=>sources.validateOpeningBook(ep));
});

test('validated books preserve exact ply and EP guards, transpositions, deterministic and injected RNG',()=>{
  const lines=[{moves:'Nf3 d5 d4 Nf6 c4',weight:2},{moves:'d4 d5 Nf3 Nf6 g3',weight:3}];
  const book=sources.validateOpeningBook(compileBook(lines,{maxPlies:12}));
  const start=new Chess().fen();
  assert.equal(chooseBookMove(start.replace('0 1','0 8'),book),null);
  assert.equal(chooseBookMove(start.replace(' - ',' e6 '),book),null);
  assert.equal(chooseBookMove(start,book,{random:()=>0}).move,'g1f3');
  assert.equal(chooseBookMove(start,book,{random:()=>0.999}).move,'d2d4');
  const sample=seed=>{const random=seededRandom(seed); return Array.from({length:40},()=>chooseBookMove(start,book,{random}).move);};
  assert.deepEqual(sample('v8'),sample('v8')); assert.notDeepEqual(sample('v8'),sample('other'));
  const chess=new Chess(); for(const san of ['Nf3','d5','d4','Nf6']) chess.move(san);
  assert.deepEqual(chooseBookMove(chess.fen(),book).candidates,[{move:'c2c4',weight:2},{move:'g2g3',weight:3}]);
  assert.equal(chooseBookMove(chess.fen().replace(/\d+$/,'4'),book),null);
});

