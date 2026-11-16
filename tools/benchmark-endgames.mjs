// Post-freeze targeted diagnostic, not a general playing-strength benchmark.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Chess} from '../src/chess.mjs';
import {chooseMove} from '../src/engine.mjs';
import {parseModel} from '../src/network.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const square=s=>'abcdefgh'[s%8]+(Math.floor(s/8)+1);
let seed=903180,attempts=0;
const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%64;};
const groups={mate:[],stalemate:[]},seen=new Set();
while((groups.mate.length<32||groups.stalemate.length<32)&&attempts<20000){
  attempts++;const k=next(),e=next(),m=next();if(new Set([k,e,m]).size!==3)continue;
  const game=new Chess();game.clear();game.put({type:'k',color:'w'},square(k));game.put({type:'k',color:'b'},square(e));game.put({type:attempts%2?'q':'r',color:'w'},square(m));
  const fen=game.fen();if(seen.has(fen)||game.isCheck()||new Chess(fen.replace(' w ',' b ')).isCheck())continue;seen.add(fen);
  const moves=game.moves({verbose:true}),mates=[],stalemates=[];
  for(const move of moves){game.move(move);if(game.isCheckmate())mates.push(move.from+move.to);else if(game.isStalemate())stalemates.push(move.from+move.to);game.undo();}
  if(mates.length&&groups.mate.length<32)groups.mate.push({fen,mates,stalemates});
  else if(!mates.length&&stalemates.length&&stalemates.length<moves.length&&groups.stalemate.length<32)groups.stalemate.push({fen,mates,stalemates});
}
if(groups.mate.length!==32||groups.stalemate.length!==32)throw new Error('Target sample quota not met');
const result={protocol:'post-freeze three-man diagnostic: seed 903180; first 32 legal positions with mate in one and first 32 non-mating positions with an avoidable stalemate; no tuning',attempts,positions:groups,models:[]};
for(const id of ['pocket','pocket-plus','atlas','atlas-plus']){
 const bytes=readFileSync(`public/models/${id}.bin`),model=parseModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const row={id,sha256:hash(bytes),mateFound:0,mateTotal:32,stalemateAvoided:0,stalemateTotal:32,choices:[]};
 for(const [kind,positions]of Object.entries(groups))for(const position of positions){
  const move=chooseMove(position.fen,model).move;
  const correct=kind==='mate'?position.mates.includes(move):!position.stalemates.includes(move);
  if(correct)row[kind==='mate'?'mateFound':'stalemateAvoided']++;
  row.choices.push({kind,fen:position.fen,move,correct});
 }
 result.models.push(row);console.log(JSON.stringify({...row,choices:undefined}));
}
writeFileSync('evaluation/v0.2/endgames.json',JSON.stringify(result,null,2)+'\n');
