import { Chess } from '../src/chess.mjs';

/** Minimal synchronous UCI: one forward pass, never consumes a search budget. */
export function createProtocol({ send, select }) {
  let game = new Chess();
  return line => {
    const tokens = line.trim().split(/\s+/);
    const command = tokens.shift();
    try {
      if (command === 'uci') {
        send('id name Astra Authored Chess');
        send('id author Astra-directed, Sol-assisted');
        send('uciok');
      } else if (command === 'isready') send('readyok');
      else if (command === 'ucinewgame') game = new Chess();
      else if (command === 'position') {
        game = null;
        const movesIndex = tokens.indexOf('moves');
        const position = movesIndex < 0 ? tokens : tokens.slice(0, movesIndex);
        if (!['startpos','fen'].includes(position[0])) throw new Error('expected startpos or fen');
        const next = position[0] === 'startpos' ? new Chess() : new Chess(position.slice(1).join(' '));
        if (movesIndex >= 0) for (const move of tokens.slice(movesIndex + 1)) next.move({from: move.slice(0,2), to: move.slice(2,4), promotion: move[4]});
        game = next;
      } else if (command === 'go') {
        if (!game) throw new Error('no valid position');
        if (tokens.includes('searchmoves')) throw new Error('searchmoves is unsupported');
        const result = game.isGameOver() ? {move: null} : select(game.fen());
        send(`bestmove ${result.move ?? '0000'}`);
      }
    } catch (error) { send(`info string error ${error.message.replace(/[\r\n]/g, ' ')}`); }
  };
}
