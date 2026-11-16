import {Chess} from '../src/chess.mjs';
export function teacherPolicy(fen,a,depth,k){
 const legal=new Chess(fen).moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')).sort(),count=Math.min(k,legal.length);
 if(!a.complete||a.depth!==depth||a.expectedLines!==count||a.lines.length!==count)throw new Error('Incomplete teacher policy');
 const ranks=new Set(),moves=new Set(),teacher=[];
 for(const l of a.lines){
  if(l.depth!==depth||l.bound||Number.isFinite(l.cp)===Number.isFinite(l.mate)||l.mate===0)throw new Error('Teacher evaluation not exact');
  if(!Number.isInteger(l.multipv)||l.multipv<1||l.multipv>count||ranks.has(l.multipv)||moves.has(l.move)||!legal.includes(l.move)||l.pv?.[0]!==l.move)throw new Error('Invalid teacher rank/root');
  ranks.add(l.multipv);moves.add(l.move);teacher.push({move:l.move,rank:l.multipv,cp:l.cp,mate:l.mate,pv:l.pv,depth});
 }
 teacher.sort((a,b)=>a.rank-b.rank);if(teacher[0].move!==a.bestmove)throw new Error('Teacher bestmove mismatch');
 return {legal,bestmove:a.bestmove,teacher};
}
