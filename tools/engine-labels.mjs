import {Chess} from '../src/chess.mjs';
export function completeLabels(fen,analysis,depth){
 const legal=new Chess(fen).moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||''));
 if(!analysis.complete||analysis.depth!==depth||analysis.expectedLines!==legal.length||analysis.lines.length!==legal.length)throw new Error('Incomplete teacher iteration');
 const byMove=new Map(analysis.lines.map(line=>[line.move,line]));
 if(byMove.size!==legal.length||!legal.every(move=>byMove.has(move)))throw new Error('Incomplete legal-root coverage');
 return legal.map(move=>{
  const line=byMove.get(move);
  if(line.depth!==depth||line.bound)throw new Error('Teacher score is not exact at requested depth');
  const cp=Number.isFinite(line.cp),mate=Number.isFinite(line.mate);
  if(cp===mate||(!cp&&line.mate===0))throw new Error('Missing or ambiguous engine score');
  const score=cp?line.cp:Math.sign(line.mate)*(10000-Math.min(999,Math.abs(line.mate))*10);
  return {move,score,cp:line.cp,mate:line.mate,depth:line.depth};
 });
}
