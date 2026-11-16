# Copyright 2025 DeepMind Technologies Limited (token/action contract).
# Copyright 2026 Chess Lab contributors (independent PyTorch implementation).
# Licensed under the Apache License, Version 2.0.
# https://www.apache.org/licenses/LICENSE-2.0
# Distributed AS IS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
"""Experimental import of DeepMind's Flax-named 9M BC checkpoint.

Contract reference: google-deepmind/searchless_chess at
90ae0e6b121673fc3079aaeffa047580bb600c0a, src/{tokenizer,utils,transformer}.py.
Weights: DeepMind, CC-BY-4.0; see CONVERSION.md for unresolved semantics.
"""
import numpy as np
import chess

CHARACTERS = '0123456789abcdefghpnrkqPBNRQKw.'
CHAR_INDEX = {c:i for i,c in enumerate(CHARACTERS)}
SEQUENCE_LENGTH = 77


def tokenize(fen: str) -> np.ndarray:
    """Official absolute-FEN contract; no color flip or clock clipping."""
    board, side, castling, ep, half, full = fen.split(' ')
    encoded = side + ''.join('.'*int(c) if c in '12345678' else c
                             for c in board.replace('/',''))
    encoded += ('' if castling == '-' else castling).ljust(4,'.')
    encoded += '..' if ep == '-' else ep
    encoded += half.ljust(3,'.') + full.ljust(3,'.')
    if len(encoded) != SEQUENCE_LENGTH:
        raise ValueError('FEN does not encode to exactly 77 tokens')
    return np.array([CHAR_INDEX[c] for c in encoded], dtype=np.uint8)


def _actions():
    moves=[]
    board=chess.BaseBoard.empty()
    for square in range(64):
        destinations=[]
        for piece in ('Q','N'):
            board.set_piece_at(square,chess.Piece.from_symbol(piece))
            destinations.extend(board.attacks(square))
        board.remove_piece_at(square)
        moves.extend(chess.square_name(square)+chess.square_name(d) for d in destinations)
    for rank, target in [('2','1'),('7','8')]:
        for i,file in enumerate('abcdefgh'):
            targets=[file]
            if i>0: targets.append('abcdefgh'[i-1])
            if i<7: targets.append('abcdefgh'[i+1])
            moves.extend(file+rank+t+target+p for t in targets for p in 'qrbn')
    return tuple(moves)


ACTION_TO_MOVE = _actions()
MOVE_TO_ACTION = {m:i for i,m in enumerate(ACTION_TO_MOVE)}


def move_index(move: str | chess.Move) -> int:
    return MOVE_TO_ACTION[move if isinstance(move,str) else move.uci()]


from dataclasses import dataclass, asdict
from pathlib import Path
import torch
from torch import nn
import torch.nn.functional as F


@dataclass(frozen=True)
class Semantics:
    """Explicit candidate assumptions, NOT checkpoint-verified metadata.

    Current Haiku code scales embeddings by sqrt(256) and uses eps=1e-5;
    Flax LayerNorm defaults to eps=1e-6. Checkpoint arrays cannot resolve this.
    Other candidate equations follow the published pre-LN bidirectional SwiGLU.
    """
    layer_norm_eps: float
    embedding_scale: float

    def __post_init__(self):
        if not (np.isfinite(self.layer_norm_eps) and self.layer_norm_eps>0
                and np.isfinite(self.embedding_scale) and self.embedding_scale>0):
            raise ValueError('semantic constants must be finite and positive')


def encode_fens(fens: list[str]) -> torch.Tensor:
    """[B,78] unshifted BC sequence = official FEN77 + dummy zero target."""
    return torch.tensor(np.stack([np.append(tokenize(f),np.uint8(0)) for f in fens]),dtype=torch.long)


class Block(nn.Module):
    def __init__(self, eps):
        super().__init__()
        self.attn_norm=nn.LayerNorm(256,eps=eps)
        self.mlp_norm=nn.LayerNorm(256,eps=eps)
        self.q=nn.Linear(256,256,bias=False)
        self.k=nn.Linear(256,256,bias=False)
        self.v=nn.Linear(256,256,bias=False)
        self.out=nn.Linear(256,256,bias=False)
        self.gate=nn.Linear(256,1024,bias=False)
        self.up=nn.Linear(256,1024,bias=False)
        self.down=nn.Linear(1024,256,bias=False)

    def forward(self, h):
        x=self.attn_norm(h)
        b,t,_=x.shape
        q,k,v=[layer(x).reshape(b,t,8,32).transpose(1,2) for layer in (self.q,self.k,self.v)]
        a=torch.softmax((q@k.transpose(-1,-2))/(32**0.5),dim=-1)
        h=h+self.out((a@v).transpose(1,2).reshape(b,t,256))
        attn=h
        x=self.mlp_norm(h)
        return h+self.down(F.silu(self.gate(x))*self.up(x)),attn


class DeepMind9M(nn.Module):
    """Differentiable candidate architecture. Forward returns raw move logits.

    Input must be unshifted [B,78] from encode_fens. Right shift is internal.
    No search, engine access, color flipping, or hand-authored chess features.
    """
    def __init__(self, semantics: Semantics):
        super().__init__()
        self.semantics=semantics
        self.token_embedding=nn.Embedding(31,256)
        self.position_embedding=nn.Embedding(78,256)
        self.blocks=nn.ModuleList([Block(semantics.layer_norm_eps) for _ in range(8)])
        self.final_norm=nn.LayerNorm(256,eps=semantics.layer_norm_eps)
        self.head=nn.Linear(256,1968)

    def _encode(self, tokens, *, return_trace=False):
        if tokens.ndim!=2 or tokens.shape[1]!=78:
            raise ValueError('expected unshifted [B,78] BC sequences')
        shifted=F.pad(tokens[:,:-1],(1,0),value=0)
        h=self.token_embedding(shifted)*self.semantics.embedding_scale+self.position_embedding.weight[None]
        traces={'embedding':h}
        for i,block in enumerate(self.blocks):
            h,attn=block(h)
            if return_trace:
                traces[f'attention_{i}']=attn
                traces[f'block_{i}']=h
        h=self.final_norm(h)
        traces['final_norm']=h
        return h,traces

    def forward_features(self, tokens):
        """Final normalized last-token embedding [B,256], retaining gradients."""
        return self._encode(tokens)[0][:,-1]

    def forward(self, tokens, *, return_all=False, return_trace=False):
        h,traces=self._encode(tokens,return_trace=return_trace)
        logits=self.head(h if return_all else h[:,-1])
        return (logits,traces) if return_trace else logits


def _mapping():
    """Every source array mapped once; reshape before transpose for Flax MHA."""
    result={
        'token_embedding.weight':('Embed_0.embedding.value',(31,256),False),
        'position_embedding.weight':('Embed_1.embedding.value',(78,256),False),
        'head.weight':('Dense_24.kernel.value',(256,1968),True),
        'head.bias':('Dense_24.bias',(1968,),False),
    }
    for i in range(8):
        for target,source in [('q','query'),('k','key'),('v','value'),('out','out')]:
            shape=(8,32,256) if target=='out' else (256,8,32)
            result[f'blocks.{i}.{target}.weight']=(f'MultiHeadDotProductAttention_{i}.{source}.kernel',shape,True)
        for offset,name,shape in [(0,'gate',(256,1024)),(1,'up',(256,1024)),(2,'down',(1024,256))]:
            result[f'blocks.{i}.{name}.weight']=(f'Dense_{3*i+offset}.kernel.value',shape,True)
        for j,name in [(2*i,'attn_norm'),(2*i+1,'mlp_norm')]:
            for target,source in [('weight','scale'),('bias','bias')]:
                result[f'blocks.{i}.{name}.{target}']=(f'LayerNorm_{j}.{source}',(256,),False)
    for target,source in [('weight','scale'),('bias','bias')]:
        result[f'final_norm.{target}']=(f'LayerNorm_16.{source}',(256,),False)
    return result


def read_official_arrays(checkpoint: str | Path) -> dict[str,np.ndarray]:
    """Read only Zarr float32 arrays via TensorStore; never unpickle metadata.

    Reject unknown arrays before reading tensor data or allocating their shapes.
    """
    import tensorstore as ts
    kv={'driver':'ocdbt','base':{'driver':'file','path':str(Path(checkpoint).resolve())+'/'}}
    store=ts.KvStore.open(kv).result()
    paths={k.decode().removesuffix('/.zarray') for k in store.list().result() if k.endswith(b'/.zarray')}
    expected={'params.'+name:shape for name,shape,_ in _mapping().values()}
    if paths!=set(expected):
        raise ValueError(f'checkpoint keys mismatch: missing={set(expected)-paths}, unexpected={paths-set(expected)}')
    arrays={}
    for path,shape in expected.items():
        array=ts.open({'driver':'zarr','kvstore':kv,'path':path},open=True).result()
        if tuple(array.shape)!=shape or array.dtype.numpy_dtype!=np.dtype('float32'):
            raise ValueError(f'invalid shape/dtype at {path}: {array.shape}, {array.dtype}')
        value=np.asarray(array.read().result())
        if not np.isfinite(value).all():
            raise ValueError(f'nonfinite array: {path}')
        arrays[path]=value
    return arrays


def convert_arrays(arrays: dict[str,np.ndarray], semantics: Semantics):
    mapping=_mapping()
    expected={'params.'+source for source,_,_ in mapping.values()}
    if set(arrays)!=expected:
        raise ValueError('checkpoint keys do not match all 94 required tensors')
    state={}
    for target,(source,shape,transpose) in mapping.items():
        value=arrays['params.'+source]
        if value.shape!=shape or value.dtype!=np.float32 or not np.isfinite(value).all():
            raise ValueError(f'invalid shape/dtype/values at {source}: {value.shape}, {value.dtype}')
        if transpose:
            if len(shape)==3: value=value.reshape(256,256)
            value=value.T
        state[target]=torch.from_numpy(value.copy())
    model=DeepMind9M(semantics)
    model.load_state_dict(state,strict=True)
    model.eval()
    return model,{
        'parameter_count':sum(x.numel() for x in state.values()),
        'tensor_count':len(state),
        'official_semantics_verified':False,
        'semantics':asdict(semantics),
        'status':'experimental: source Flax implementation/config unavailable',
    }


def load_official(checkpoint: str | Path, *, semantics: Semantics | None=None):
    if semantics is None:
        raise ValueError('Exact released Flax semantics are unresolved; pass explicit candidate semantics only for experiments')
    return convert_arrays(read_official_arrays(checkpoint),semantics)


@torch.no_grad()
def rank_legal(model: DeepMind9M, board: chess.Board) -> list[dict]:
    """Legal-only softmax, descending probability; no engine/search calls."""
    moves=sorted(board.legal_moves,key=lambda m:m.uci())
    if not moves: return []
    device=next(model.parameters()).device
    logits=model(encode_fens([board.fen()]).to(device))[0]
    selected=logits[torch.tensor([move_index(m) for m in moves],device=device)]
    probabilities=torch.softmax(selected,dim=-1).cpu().tolist()
    return sorted([{'move':m.uci(),'probability':p} for m,p in zip(moves,probabilities)],
                  key=lambda x:(-x['probability'],x['move']))


def save_converted(model: DeepMind9M, path: str | Path, metadata: dict):
    """Save local tensor-only state plus plain metadata; refuse public paths."""
    path=Path(path).resolve()
    if '.cache' not in path.parts:
        raise ValueError('converted weights must remain under a .cache directory')
    path.parent.mkdir(parents=True,exist_ok=True)
    metadata=dict(metadata)
    metadata.update(semantics=asdict(model.semantics),official_semantics_verified=False,
                    format_version=1,attribution='DeepMind searchless_chess; weights CC-BY-4.0')
    torch.save({'state_dict':{k:v.detach().cpu().clone() for k,v in model.state_dict().items()},
                'metadata':metadata},path)


def load_converted(path: str | Path, *, allow_experimental=False):
    """Never execute arbitrary pickles; strict restoration of local state only."""
    payload=torch.load(path,map_location='cpu',weights_only=True)
    metadata=payload['metadata']
    if not allow_experimental:
        raise ValueError('unverified experimental conversion; opt in explicitly')
    model=DeepMind9M(Semantics(**metadata['semantics']))
    model.load_state_dict(payload['state_dict'],strict=True)
    model.eval()
    return model,metadata
