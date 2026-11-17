import { compileBook } from './opening-book.mjs';

/** Strictly replay all source SAN before accepting a fetched, offline v1 book. */
export function validateOpeningBook(payload) {
  if (!payload || payload.version!==1 || !Number.isInteger(payload.maxPlies) || payload.maxPlies<1 || payload.maxPlies>64 ||
      !Array.isArray(payload.lines) || !payload.lines.length || payload.lines.length>10000 ||
      !payload.positions || typeof payload.positions!=='object' || Array.isArray(payload.positions)) throw new Error('Invalid opening book schema');
  let totalPlies=0;
  for(const line of payload.lines) {
    const moves=typeof line?.moves==='string'?line.moves.trim().split(/\s+/):line?.moves;
    if(!Array.isArray(moves) || !moves.length || moves.length>128 || (totalPlies+=moves.length)>500000 ||
        moves.some(move=>typeof move!=='string' || move.length>16)) throw new Error('Invalid opening line bounds');
  }
  const rebuilt=compileBook(payload.lines,{maxPlies:payload.maxPlies});
  const expected=rebuilt.positions;
  if(Object.keys(payload.positions).length!==Object.keys(expected).length) throw new Error('Opening positions mismatch');
  for(const [key,entries] of Object.entries(expected)) {
    const actual=payload.positions[key];
    if(!Array.isArray(actual) || actual.length!==entries.length) throw new Error('Opening entries mismatch');
    for(let i=0;i<entries.length;i++) {
      if(!actual[i] || Object.keys(actual[i]).sort().join(',')!=='move,ply,weight' ||
          actual[i].move!==entries[i].move || actual[i].ply!==entries[i].ply || actual[i].weight!==entries[i].weight) throw new Error('Opening continuation mismatch');
    }
  }
  return {maxPlies:rebuilt.maxPlies,positions:expected};
}
