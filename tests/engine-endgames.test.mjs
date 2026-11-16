import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from '../src/chess.mjs';
import {encodePosition} from '../src/engine.mjs';
import {parseModel,forward} from '../src/network.mjs';
import {Graph,encodeModel} from '../tools/compile-models.mjs';
import {buildKingEndgames} from '../tools/endgame-circuits.mjs';

let model;
before(()=>{
  const graph=new Graph(); const terms=buildKingEndgames(graph);
  const outputs=[];
  for(let from=0;from<64;from++)for(let to=0;to<64;to++)outputs.push(graph.node(terms(from,to,[3,4,5]),0,0));
  model=parseModel(encodeModel({inputCount:768,nodes:graph.nodes,outputs,metadata:{test:true}}).buffer);
});
const index=s=>(Number(s[1])-1)*8+s.charCodeAt(0)-97;
const score=(scores,move)=>scores[index(move.from)*64+index(move.to)];

test('specialist distinguishes queen mate, rook mate, and stalemate',()=>{
  for(const fen of ['7k/5K2/6Q1/8/8/8/8/8 w - - 0 1','7k/5K2/8/7R/8/8/8/8 w - - 0 1']){
    const board=new Chess(fen);const scores=forward(model,encodePosition(fen));let terminal=0;
    for(const move of board.moves({verbose:true})){
      board.move(move);const mate=board.isCheckmate(),stale=board.isStalemate();board.undo();
      assert.equal(score(scores,move)>90,mate,fen+' '+move.san+' mate');
      assert.equal(score(scores,move)<-90,stale,fen+' '+move.san+' stale');
      if(mate||stale)terminal++;
    }
    assert.ok(terminal>0);
  }
});

test('specialist is inactive outside exactly own king plus one major versus bare king',()=>{
  for(const fen of ['7k/7p/6Q1/8/8/8/8/5K2 w - - 0 1','7k/8/6Q1/8/8/8/P7/5K2 w - - 0 1','7k/8/6Q1/8/8/8/R7/5K2 w - - 0 1']){
    const scores=forward(model,encodePosition(fen));assert.ok(scores.every(value=>value===0));
  }
});

test('specialist terminal signs agree with independent rules over seeded three-man positions',()=>{
  let state=92213,checked=0,positions=0;
  const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)%64;};
  const square=s=>'abcdefgh'[s%8]+(Math.floor(s/8)+1);
  while(positions<128){
    const own=next(),enemy=next(),major=next();
    if(new Set([own,enemy,major]).size!==3)continue;
    const b=new Chess();b.clear();
    b.put({type:'k',color:'w'},square(own));b.put({type:'k',color:'b'},square(enemy));
    b.put({type:positions%2?'q':'r',color:'w'},square(major));
    if(b.isCheck()||new Chess(b.fen().replace(' w ',' b ')).isCheck())continue;
    const scores=forward(model,encodePosition(b.fen()));
    for(const move of b.moves({verbose:true})){
      b.move(move);const mate=b.isCheckmate(),stale=b.isStalemate();b.undo();
      assert.equal(score(scores,move)>90,mate,b.fen()+' '+move.san);
      assert.equal(score(scores,move)<-90,stale,b.fen()+' '+move.san);
      checked++;
    }
    positions++;
  }
  assert.ok(checked>1000);
});
