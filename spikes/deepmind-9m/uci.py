"""Minimal synchronous UCI protocol; search-free choice supplied by caller."""
import chess
class Protocol:
    def __init__(self,send,select):self.send=send;self.select=select;self.board=chess.Board()
    def handle(self,line):
        words=line.strip().split()
        if not words:return True
        command=words[0]
        try:
            if command=='quit':return False
            if command=='uci':
                for message in ['id name Chess Lab 9M','id author Chess Lab contributors; pretrained weights Google DeepMind','uciok']:self.send(message)
            elif command=='isready':self.send('readyok')
            elif command=='ucinewgame':self.board=chess.Board()
            elif command=='position':
                self.board=None
                if len(words)>=2 and words[1]=='startpos':board=chess.Board();offset=2
                elif len(words)>=8 and words[1]=='fen':board=chess.Board(' '.join(words[2:8]));offset=8
                else:raise ValueError('invalid position syntax')
                if not board.is_valid():raise ValueError('invalid board')
                if len(words)>offset:
                    if words[offset]!='moves':raise ValueError('expected moves')
                    for move in words[offset+1:]:board.push_uci(move)
                self.board=board
            elif command=='go':
                if self.board is None:raise ValueError('no valid position')
                if self.board.is_game_over(claim_draw=True):self.send('bestmove 0000')
                else:
                    move=chess.Move.from_uci(self.select(self.board.copy(stack=True)))
                    if move not in self.board.legal_moves:raise ValueError('illegal policy move')
                    self.send('bestmove '+move.uci())
        except (ValueError,TypeError) as error:
            self.send('info string error '+str(error).replace('\n',' '))
            if command=='go':self.send('bestmove 0000')
        return True
