import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('curated artifact has at least 30 fully validated branches with exact position boundaries', async () => {
  const url = new URL('../public/openings.json', import.meta.url);
  assert.ok(existsSync(url), 'curated book artifact must exist');
  const { compileBook, chooseBookMove, positionKey } = await import('../src/opening-book.mjs');
  const book = JSON.parse(readFileSync(url));
  assert.ok(book.lines.length >= 30);
  assert.deepEqual(compileBook(book.lines,{maxPlies:book.maxPlies}),book);
  const fen=new Chess().fen();
  assert.equal(chooseBookMove(fen.replace('0 1','0 20'),book),null);
  assert.equal(chooseBookMove(fen.replace('KQkq','-'),book),null);
  assert.equal(chooseBookMove(fen,book,{enabled:false}),null);
  assert.notEqual(positionKey(fen),positionKey(fen.replace(' - ',' e3 ')));
  const drawn=fen.replace('0 1','100 1');
  assert.equal(chooseBookMove(drawn,book),null);
  const corrupt={...book,positions:{[positionKey(fen)]:[{move:'e2e5',weight:10,ply:0}]}};
  assert.equal(chooseBookMove(fen,corrupt),null);
});
import { Chess } from '../src/chess.mjs';
const moduleURL = new URL('../src/opening-book.mjs', import.meta.url);
test('weighted book validates complete lines and samples reproducibly without neural scores', async () => {
  assert.ok(existsSync(moduleURL), 'opening book module must exist');
  const { compileBook, chooseBookMove, seededRandom } = await import(moduleURL);
  const book = compileBook([{moves:'e4 e5 Nf3 Nc6',weight:3},{moves:'d4 d5 c4 e6',weight:1}]);
  const fen = new Chess().fen();
  const a=seededRandom('example'), b=seededRandom('example');
  assert.deepEqual(Array.from({length:20},()=>chooseBookMove(fen,book,{random:a}).move),Array.from({length:20},()=>chooseBookMove(fen,book,{random:b}).move));
  assert.equal(chooseBookMove(fen,book,{random:()=>0}).move,'e2e4');
  assert.equal(chooseBookMove(fen,book,{random:()=>0.99}).move,'d2d4');
  const reply=chooseBookMove(fen,book,{random:()=>0});
  assert.equal(reply.source,'book'); assert.ok(reply.candidates.every(c=>!('score' in c)));
  assert.throws(()=>compileBook([{moves:'e4 e5 e5',weight:1}]),/illegal|invalid/i);
});
