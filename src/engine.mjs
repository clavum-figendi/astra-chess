import { Chess } from './chess.mjs';
import { forward } from './network.mjs';

const canonicalSquare = (square, own) => (own === 'w' ? Number(square[1]) - 1 : 8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;

export function chooseMove(fen, model) {
  const started = performance.now();
  if (model.inputCount !== 768 || model.outputCount !== 20480) throw new Error('Model is not an Astra chess policy');
  const chess = new Chess(fen);
  const own = chess.turn();
  const legal = chess.moves({ verbose: true });
  if (!legal.length || chess.isInsufficientMaterial() || chess.isDrawByFiftyMoves()) {
    return { move: null, candidates: [], elapsedMs: performance.now() - started };
  }
  const logits = forward(model, encodePosition(fen));
  const candidates = legal.map(move => {
    const from = canonicalSquare(move.from, own), to = canonicalSquare(move.to, own);
    const promotion = move.promotion ? ' qrbn'.indexOf(move.promotion) : 0;
    const score = logits[(from * 64 + to) * 5 + promotion];
    if (!Number.isFinite(score)) throw new Error('Non-finite network output');
    return { move: move.from + move.to + (move.promotion || ''), score };
  }).sort((a, b) => b.score - a.score || (a.move < b.move ? -1 : a.move > b.move ? 1 : 0));
  return { move: candidates[0]?.move || null, candidates: candidates.slice(0, 5), elapsedMs: performance.now() - started };
}

const TYPES = 'pnbrqk';

export function encodePosition(fen) {
  const chess = new Chess(fen);
  const own = chess.turn();
  const input = new Float32Array(768);
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const file = piece.square.charCodeAt(0) - 97;
      const rank = Number(piece.square[1]) - 1;
      const square = (own === 'w' ? rank : 7 - rank) * 8 + file;
      input[((piece.color === own ? 0 : 6) + TYPES.indexOf(piece.type)) * 64 + square] = 1;
    }
  }
  return input;
}
