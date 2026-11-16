# Copyright 2026 Astra contributors. Licensed under Apache-2.0.
"""Local-only experimental DeepMind BC conversion/inference; no engine calls."""
import argparse
import json
from pathlib import Path
import sys
import chess
import torch
from model import Semantics, load_official, load_converted, save_converted, rank_legal


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    source=parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--checkpoint',type=Path,help='extracted OCDBT checkpoint directory')
    source.add_argument('--converted',type=Path,help='local .cache tensor-only conversion')
    parser.add_argument('--allow-experimental',action='store_true',help='acknowledge unresolved original Flax semantics')
    parser.add_argument('--layer-norm-eps',type=float)
    parser.add_argument('--embedding-scale',type=float)
    parser.add_argument('--save',type=Path,help='save under .cache only')
    parser.add_argument('--fen',default=chess.STARTING_FEN)
    parser.add_argument('--top',type=int,default=5)
    parser.add_argument('--threads',type=int,default=1)
    args=parser.parse_args()
    if not args.allow_experimental:
        parser.error('original Flax semantics unverified: explicit --allow-experimental is required')
    if args.threads<1 or args.top<1: parser.error('threads and top must be positive')
    torch.set_num_threads(args.threads)
    if args.checkpoint:
        if args.layer_norm_eps is None or args.embedding_scale is None:
            parser.error('candidate import requires explicit --layer-norm-eps and --embedding-scale')
        model,metadata=load_official(args.checkpoint,semantics=Semantics(args.layer_norm_eps,args.embedding_scale))
    else:
        model,metadata=load_converted(args.converted,allow_experimental=True)
    if args.save: save_converted(model,args.save,metadata)
    board=chess.Board(args.fen)
    ranked=rank_legal(model,board)
    print('WARNING: candidate equations only; original released-checkpoint parity NOT established.',file=sys.stderr)
    print(json.dumps({'metadata':metadata,'fen':board.fen(),'legal_move_count':len(ranked),'top_moves':ranked[:args.top]},indent=2))


if __name__=='__main__': main()
