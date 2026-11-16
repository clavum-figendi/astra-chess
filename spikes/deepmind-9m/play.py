# Copyright 2026 Chess Lab contributors. Apache-2.0.
"""CPU UCI/JSON runner for original or adapted DeepMind action-value weights."""
import argparse,json,sys
import chess
import torch
from action_value import load_converted,rank_legal
from uci import Protocol

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--weights',required=True)
    parser.add_argument('--fen')
    parser.add_argument('--threads',type=int,default=1)
    parser.add_argument('--batch-size',type=int,default=8)
    args=parser.parse_args()
    if not 1<=args.threads<=8 or not 1<=args.batch_size<=64:parser.error('threads must be 1..8 and batch-size 1..64')
    torch.set_num_threads(args.threads)
    model,metadata=load_converted(args.weights)
    def ranked(board):
        return [] if board.is_game_over(claim_draw=True) else rank_legal(model,board,batch_size=args.batch_size)
    if args.fen:
        board=chess.Board(args.fen)
        if not board.is_valid():raise ValueError('Invalid board')
        candidates=ranked(board)
        print(json.dumps({'move':candidates[0]['move'] if candidates else None,'candidates':candidates[:5],'source':'neural-action-value','adapted':bool(metadata.get('adaptation'))}))
    else:
        protocol=Protocol(lambda line:print(line,flush=True),lambda board:ranked(board)[0]['move'])
        for line in sys.stdin:
            if not protocol.handle(line):break
if __name__=='__main__':main()
