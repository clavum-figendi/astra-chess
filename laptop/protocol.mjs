import { Chess } from '../src/chess.mjs';

/** Minimal synchronous UCI: one forward pass, never consumes a search budget. */
export function createProtocol({ send, select, onNewGame = () => {} }) {
  let game = new Chess();
  let importedFen = null;
  return line => {
    const tokens = line.trim().split(/\s+/);
    const command = tokens.shift();
    try {
      if (command === 'uci') {
        send('id name Chess Lab');
        send('id author Chess Lab contributors');
        send('uciok');
      } else if (command === 'isready') send('readyok');
      else if (command === 'ucinewgame') { game = new Chess(); importedFen = null; onNewGame(); }
      else if (command === 'position') {
        game = null; importedFen = null;
        const movesIndex = tokens.indexOf('moves');
        const position = movesIndex < 0 ? tokens : tokens.slice(0, movesIndex);
        if (!['startpos','fen'].includes(position[0])) throw new Error('expected startpos or fen');
        const next = position[0] === 'startpos' ? new Chess() : new Chess(position.slice(1).join(' '));
        if (movesIndex >= 0) for (const move of tokens.slice(movesIndex + 1)) next.move({from: move.slice(0,2), to: move.slice(2,4), promotion: move[4]});
        game = next;
        if (position[0] === 'fen' && !next.history().length) importedFen = position.slice(1).join(' ');
      } else if (command === 'go') {
        if (!game) throw new Error('no valid position');
        if (tokens.includes('searchmoves')) throw new Error('searchmoves is unsupported');
        const result = game.isGameOver() ? {move: null} : select(importedFen || game.fen());
        if (result.source) send(`info string source ${result.source} seed ${JSON.stringify(result.seed ?? '')} book ${Boolean(result.book)}`);
        send(`bestmove ${result.move ?? '0000'}`);
      }
    } catch (error) { send(`info string error ${error.message.replace(/[\r\n]/g, ' ')}`); }
  };
}
