import { Chess } from './chess.mjs';

/** Preserve side, castling and en-passant exactly; clocks are not position identity. */
export const positionKey = fen => fen.trim().split(/\s+/).slice(0, 4).join(' ');
const plyOf = fen => { const f=fen.trim().split(/\s+/); return (Number(f[5])-1)*2+(f[1]==='b'?1:0); };
const uci = move => move.from + move.to + (move.promotion || '');

/** Deterministic text-seeded PRNG, independent of runtime and model. */
export function seededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Compile every SAN move, including moves past the selection boundary. */
export function compileBook(lines, { maxPlies = 12 } = {}) {
  const positions = {};
  if (!Array.isArray(lines) || !lines.length || !Number.isInteger(maxPlies) || maxPlies < 1) throw new Error('Invalid opening lines or maxPlies');
  for (const line of lines) {
    const weight = line.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) throw new Error('Invalid opening weight');
    const chess = new Chess();
    const moves = typeof line.moves === 'string' ? line.moves.trim().split(/\s+/) : line.moves;
    if (!Array.isArray(moves) || !moves.length) throw new Error('Invalid opening moves');
    for (let ply=0; ply<moves.length; ply++) {
      const fen = chess.fen();
      const move = chess.move(moves[ply], { strict: true });
      if (!move) throw new Error(`Illegal opening move ${moves[ply]}`);
      if (ply >= maxPlies) continue;
      const entries = positions[positionKey(fen)] ||= [];
      const existing = entries.find(e => e.move===uci(move) && e.ply===ply);
      if (existing) existing.weight += weight;
      else entries.push({move:uci(move), weight, ply});
    }
  }
  return { version:1, maxPlies, lines, positions };
}

/** Returns null outside the book; never returns an illegal or terminal move. */
export function chooseBookMove(fen, book, { random = Math.random, enabled = true } = {}) {
  if (!enabled || !book) return null;
  const started = performance.now();
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;
  const ply = plyOf(fen);
  if (!Number.isInteger(ply) || ply < 0 || ply >= book.maxPlies) return null;
  const legal = new Set(chess.moves({verbose:true}).map(uci));
  const candidates = (book.positions?.[positionKey(fen)] || []).filter(e=>e.ply===ply && legal.has(e.move) && Number.isFinite(e.weight) && e.weight>0).map(({move,weight})=>({move,weight}));
  if (!candidates.length) return null;
  const total = candidates.reduce((sum,e)=>sum+e.weight,0);
  const roll = random();
  if (!Number.isFinite(roll) || roll<0 || roll>=1) throw new Error('Book random must return [0, 1)');
  let remaining = roll*total;
  const chosen = candidates.find(e => (remaining -= e.weight)<0) || candidates.at(-1);
  return {move:chosen.move,source:'book',candidates,elapsedMs:performance.now()-started};
}
