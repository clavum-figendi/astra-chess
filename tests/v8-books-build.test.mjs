import test from 'node:test';
import assert from 'node:assert/strict';
import * as builder from '../tools/v8-books-build.mjs';
import { Chess } from '../src/chess.mjs';
import { positionKey } from '../src/opening-book.mjs';

test('game weights preserve observed duplicate paths and both profiles use the same corpus',()=>{
  assert.equal(typeof builder.buildGameBook,'function');
  const games=[{id:'a',moves:'e4 e5',speed:'blitz'},{id:'b',moves:'e4 e5',speed:'rapid'}, {id:'c',moves:'d4 d5',speed:'classical'}];
  const {book,stats}=builder.buildGameBook(games);
  assert.equal(stats.games,3); assert.equal(book.lines.length,2);
  assert.equal(book.lines[0].weight,2);
  const root=book.positions[positionKey(new Chess().fen())];
  assert.equal(root.reduce((s,e)=>s+e.weight,0),3);
  assert.throws(()=>builder.buildGameBook([{id:'x',moves:'e4 e5 e5',speed:'rapid'}]));
  const shared='e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5';
  const compact=builder.buildGameBook([{id:'a',moves:shared+' Bb3 d6'}, {id:'b',moves:shared+' Bb3 O-O'}]);
  assert.equal(compact.book.lines.length,1); assert.equal(compact.book.lines[0].weight,2);
  assert.equal(compact.book.maxPlies,12); assert.equal(compact.book.lines[0].moves,shared);
  assert.throws(()=>builder.buildGameBook([{id:'x',moves:shared+' e4'}]));
});
