import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACTION_TO_MOVE,tokenizeFen,repetitionOverrides} from '../src/transformer.mjs';
import {Chess} from 'chess.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/deepmind-token-contract.json',import.meta.url)));
test('every browser action ID exactly matches the verified Python checkpoint contract',()=>assert.deepEqual(ACTION_TO_MOVE,fixture.actions));
test('browser FEN tokens match actual Python tokens including promotion and en passant',()=>{
 for(const row of fixture.fens)assert.deepEqual(Array.from(tokenizeFen(row.fen)),row.tokens);
});
test('repetition override preserves full history and rejects mismatched history',()=>{
 const history=['g1f3','g8f6','f3g1','f6g8','g1f3','g8f6','f3g1'];const board=new Chess();for(const move of history)board.move(move);
 const override=repetitionOverrides(Chess,{history},['f6g8','h7h6'],board.fen());
 assert.equal(override.get('f6g8'),0.5);assert.equal(override.has('h7h6'),false);
 assert.throws(()=>repetitionOverrides(Chess,{history:[]},['f6g8'],board.fen()),/History/);
});
