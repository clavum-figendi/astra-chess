import { Chess } from '../src/chess.mjs';
const uci = move => move.from + move.to + (move.promotion ?? '');
export function scorePuzzle(puzzle, select) {
  const game = new Chess(puzzle.fen);
  game.move(puzzle.moves[0]);
  const choices = [];
  let firstCorrect = false;
  for (let i=1;i<puzzle.moves.length;i++) {
    if (i%2 === 1) {
      const actual = select(game.fen());
      const correct = actual === puzzle.moves[i];
      choices.push({actual,expected:puzzle.moves[i],correct});
      if (i===1) firstCorrect = correct;
      if (!correct) return {solved:false,firstCorrect,choices};
      game.move(actual);
    } else game.move(puzzle.moves[i]);
  }
  return {solved:true,firstCorrect,choices};
}
export function randomPolicy(seed=42) {
  let state=seed>>>0;
  return fen=> {
    const moves=new Chess(fen).moves({verbose:true}).map(uci).sort();
    state^=state<<13; state^=state>>>17; state^=state<<5;
    return moves.length ? moves[(state>>>0)%moves.length] : null;
  };
}
export function greedyPolicy(fen) {
  const value={p:1,n:3,b:3,r:5,q:9,k:0};
  return new Chess(fen).moves({verbose:true}).map(move=>({move:uci(move),score:(value[move.captured]??0)+(value[move.promotion]??0)})).sort((a,b)=>b.score-a.score || a.move.localeCompare(b.move))[0]?.move ?? null;
}
export function playGame(white,black,opening=[],maxPlies=160) {
  const game=new Chess(); for(const move of opening) game.move(move);
  while(!game.isGameOver() && game.history().length<maxPlies) {
    const choice=(game.turn()==='w'?white:black)(game.fen());
    if(!choice) throw new Error('Policy returned no move in a nonterminal position');
    game.move(choice);
  }
  const result=game.isCheckmate()?(game.turn()==='w'?'0-1':'1-0'):'1/2-1/2';
  const termination=game.isCheckmate()?'checkmate':game.isStalemate()?'stalemate':game.isThreefoldRepetition()?'threefold':game.isInsufficientMaterial()?'insufficient-material':game.isDrawByFiftyMoves()?'fifty-move':'ply-limit';
  game.setHeader('Result',result,'Termination',termination);
  return {result,termination,plies:game.history().length,pgn:game.pgn()};
}
