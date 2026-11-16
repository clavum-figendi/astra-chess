// A candidate is deliberately not required to be legal before the opponent moves.
export function createPremove() {
  let queued = null;
  return {
    peek: () => queued,
    clear() { queued = null; },
    set(game, human, from, to, token) {
      if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) || from === to || game.turn() === human || game.get(from)?.color !== human) return false;
      const piece = game.get(from);
      const castle = piece.type === 'k' && from === `e${human === 'w' ? '1' : '8'}` && ['c','g'].some(f => to === f + from[1]);
      if (game.get(to)?.color === human && !castle) return false;
      queued = Object.freeze({ from, to, token, promotion: piece.type === 'p' && ['1','8'].includes(to[1]) ? 'q' : undefined });
      return true;
    },
    take(game, {human, token, active, flagged = false}) {
      const candidate = queued; queued = null;
      if (!candidate || !active || flagged || candidate.token !== token || game.turn() !== human || game.isGameOver()) return null;
      return game.moves({verbose:true}).find(m => m.from === candidate.from && m.to === candidate.to && m.promotion === candidate.promotion) || null;
    },
  };
}
