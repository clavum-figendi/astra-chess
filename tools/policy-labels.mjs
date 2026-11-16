import {completeLabels} from './engine-labels.mjs';
export function policyLabels(fen,analysis,depth){
 const exact=completeLabels(fen,analysis,depth),ranks=new Set();
 const moves=exact.map(label=>{
  const line=analysis.lines.find(l=>l.move===label.move),rank=line.multipv;
  if(!Number.isInteger(rank)||rank<1||rank>exact.length||ranks.has(rank))throw new Error('Invalid teacher rank');ranks.add(rank);
  if(line.pv?.[0]!==line.move)throw new Error('Invalid teacher PV');
  return {move:line.move,rank,cp:label.cp,mate:label.mate,depth,pv:line.pv};
 });
 if(moves.find(m=>m.rank===1)?.move!==analysis.bestmove)throw new Error('Teacher bestmove disagrees with rank 1');
 return {bestmove:analysis.bestmove,moves};
}
