import { Chess } from '../src/chess.mjs';
import { chooseMove } from '../src/engine.mjs';

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
function terminal(game) {
  if (game.isCheckmate()) return { result: game.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  if (game.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (game.isThreefoldRepetition()) return { result: '1/2-1/2', termination: 'threefold-repetition' };
  if (game.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient-material' };
  if (game.isDrawByFiftyMoves()) return { result: '1/2-1/2', termination: 'fifty-move-rule' };
  if (game.isDraw()) return { result: '1/2-1/2', termination: 'draw' };
  return null;
}

/** Uses the compiled network's actual search-free chooseMove; engines are teachers/opponents only.
 * maxPlies includes opening plies. The caller owns/retains the engine connection.
 */
export async function playEngineGame({ model, engine, opening = [], modelColor, limit = { depth: 4 }, maxPlies = 160 } = {}) {
  if (!['w', 'b'].includes(modelColor)) throw new Error('modelColor must be w or b');
  if (!engine || typeof engine.analyze !== 'function' || !engine.identity) throw new Error('Open engine required');
  if (!Number.isSafeInteger(maxPlies) || maxPlies < 0 || maxPlies > 10000) throw new Error('Invalid maxPlies');
  if (!Array.isArray(opening) || opening.some(move => typeof move !== 'string' || !UCI_MOVE.test(move))) throw new Error('Invalid opening UCI moves');
  if (opening.length > maxPlies) throw new Error('Opening exceeds maxPlies');
  if (!limit || typeof limit !== 'object' || Array.isArray(limit)) throw new Error('Invalid engine limit');
  for (const [key, value] of Object.entries(limit)) {
    if (!['depth', 'nodes'].includes(key) || !Number.isSafeInteger(value) || value < 1 || (key === 'depth' && value > 128)) throw new Error('Invalid engine limit');
  }
  const game = new Chess(), moves = [], modelDecisions = [];
  for (const move of opening) {
    if (terminal(game)) throw new Error('Opening continues after game ended');
    game.move(move); moves.push(move);
  }
  let outcome;
  while (!(outcome = terminal(game))) {
    if (moves.length >= maxPlies) { outcome = { result: '1/2-1/2', termination: 'ply-cap' }; break; }
    const fen = game.fen(), ply = moves.length + 1;
    let move;
    if (game.turn() === modelColor) {
      const decision = chooseMove(fen, model);
      move = decision.move;
      modelDecisions.push({ ply, fen, move, elapsedMs: decision.elapsedMs, candidates: decision.candidates });
    } else {
      const analysis = await engine.analyze(fen, { ...limit, moves: [...moves] });
      move = analysis.bestmove;
    }
    if (typeof move !== 'string' || !UCI_MOVE.test(move)) throw new Error(`Illegal/null move at ply ${ply}: ${move}`);
    try { game.move(move); } catch (error) { throw new Error(`Illegal move at ply ${ply}: ${move}`, { cause: error }); }
    moves.push(move);
  }
  const cleanName = value => String(value || '').replace(/["\\\r\n\0]/g, ' ').slice(0, 200);
  const modelName = cleanName(model?.metadata?.name || model?.metadata?.id || 'Astra compiled policy');
  const engineName = cleanName(engine.identity.name);
  game.setHeader('White', modelColor === 'w' ? modelName : engineName);
  game.setHeader('Black', modelColor === 'b' ? modelName : engineName);
  game.setHeader('Result', outcome.result);
  game.setHeader('Termination', outcome.termination);
  return { ...outcome, plies: moves.length, pgn: game.pgn(), modelDecisions, engineIdentity: { ...engine.identity } };
}
