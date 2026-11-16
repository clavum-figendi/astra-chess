# Copyright 2025 DeepMind Technologies Limited (architecture/contracts).
# Copyright 2026 Chess Lab contributors (PyTorch conversion and tooling).
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Official Haiku 9M action-value checkpoint, implemented in PyTorch.

Source: google-deepmind/searchless_chess revision
90ae0e6b121673fc3079aaeffa047580bb600c0a. Weights CC-BY-4.0.
"""
from pathlib import Path, PurePosixPath
import hashlib
import stat
import zipfile

ARCHIVE_SHA256='e7a62f07c14819ec77433f108d3490599cdf097a49afe64f1be3973d19c34eed'
ARCHIVE_BYTES=66375867
REVISION='90ae0e6b121673fc3079aaeffa047580bb600c0a'


def extract_official(archive: str | Path, destination: str | Path) -> Path:
    """Verified archive only; cap count/size and reject traversal/links."""
    archive=Path(archive)
    if archive.stat().st_size!=ARCHIVE_BYTES:
        raise ValueError('unexpected archive size')
    with archive.open('rb') as stream:
        digest=hashlib.file_digest(stream,'sha256').hexdigest()
    if digest!=ARCHIVE_SHA256:raise ValueError('archive SHA-256 mismatch')
    destination=Path(destination).resolve()
    destination.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        entries=z.infolist()
        if len(entries)>100 or sum(i.file_size for i in entries)>80_000_000:
            raise ValueError('archive exceeds extraction budget')
        paths=[]
        for i in entries:
            path=PurePosixPath(i.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in i.filename or not path.parts or path.parts[0]!='9M':
                raise ValueError('unsafe archive member')
            mode=i.external_attr>>16
            if stat.S_ISLNK(mode):raise ValueError('archive links forbidden')
            target=destination.joinpath(*path.parts)
            if not target.resolve().is_relative_to(destination):raise ValueError('unsafe extraction target')
            if not i.is_dir() and i.file_size>40_000_000:raise ValueError('oversized archive member')
            paths.append((i,target))
        for i,target in paths:
            if i.is_dir():target.mkdir(parents=True,exist_ok=True)
            else:
                target.parent.mkdir(parents=True,exist_ok=True)
                with z.open(i) as src,target.open('wb') as out:
                    import shutil
                    shutil.copyfileobj(src,out,length=1024*1024)
    return destination/'9M/6400000/params'


import numpy as np
import torch
from torch import nn
import torch.nn.functional as F
import chess
from model import tokenize, move_index, MOVE_TO_ACTION, ACTION_TO_MOVE, Block

CONFIG={'vocab_size':1968,'output_size':128,'embedding_dim':256,'num_layers':8,
        'num_heads':8,'use_causal_mask':False,'pos_encodings':'LEARNED',
        'max_sequence_length':79,'widening_factor':4,'apply_qk_layernorm':False,
        'apply_post_ln':True,'layer_norm_eps':1e-5,'embedding_scale':16.0}


def encode_state_actions(fen: str, moves) -> torch.Tensor:
    """Unshifted [B,79] = absolute FEN77 + action ID + dummy bucket zero.

    Does not restrict moves to legal moves; rank_legal handles that separately.
    """
    ids=[move_index(m) for m in moves]
    if not ids:return torch.empty((0,79),dtype=torch.long)
    rows=np.empty((len(ids),79),dtype=np.int64)
    rows[:,:77]=tokenize(fen)
    rows[:,77]=ids;rows[:,78]=0
    return torch.from_numpy(rows)


class ActionValue9M(nn.Module):
    """Exact published 9M Haiku forward equations; raw 128 bucket logits.

    Reuses the previously tested Block only: its attention and sequential
    pre-LN SwiGLU math matches official source with eps explicitly set to 1e-5.
    No BC model class, semantics or tensor converter is used.
    """
    def __init__(self):
        super().__init__()
        self.token_embedding=nn.Embedding(1968,256)
        self.position_embedding=nn.Embedding(79,256)
        self.blocks=nn.ModuleList([Block(1e-5) for _ in range(8)])
        self.final_norm=nn.LayerNorm(256,eps=1e-5)
        self.head=nn.Linear(256,128)

    def _features(self,tokens):
        if tokens.ndim!=2 or tokens.shape[1]!=79:raise ValueError('expected unshifted [B,79] state-action sequences')
        shifted=F.pad(tokens[:,:-1],(1,0),value=0)
        h=self.token_embedding(shifted)*16.0+self.position_embedding.weight[None]
        for block in self.blocks:h=block(h)[0]
        return self.final_norm(h)

    def forward_features(self,tokens):
        """Final normalized last-token embeddings [B,256], differentiable."""
        return self._features(tokens)[:,-1]

    def forward(self,tokens,*,return_all=False):
        h=self._features(tokens)
        return self.head(h if return_all else h[:,-1])


def _haiku_name(prefix,index):return prefix if index==0 else f'{prefix}_{index}'


def parameter_mapping():
    """One-to-one source key -> PyTorch key/shape/transpose, all 94 arrays."""
    result={
        'embed.embeddings':('token_embedding.weight',(1968,256),False),
        'embed_1.embeddings':('position_embedding.weight',(79,256),False),
        'linear_24.w':('head.weight',(256,128),True),
        'linear_24.b':('head.bias',(128,),False),
    }
    for i in range(8):
        prefix=_haiku_name('multi_head_dot_product_attention',i)
        for j,name in enumerate(['q','k','v','out']):
            result[prefix+'/'+_haiku_name('linear',j)+'.w']=(f'blocks.{i}.{name}.weight',(256,256),True)
        for j,name,shape in [(0,'gate',(256,1024)),(1,'up',(256,1024)),(2,'down',(1024,256))]:
            result[_haiku_name('linear',3*i+j)+'.w']=(f'blocks.{i}.{name}.weight',shape,True)
        for j,name in [(2*i,'attn_norm'),(2*i+1,'mlp_norm')]:
            for source,target in [('scale','weight'),('offset','bias')]:
                result[_haiku_name('layer_norm',j)+'.'+source]=(f'blocks.{i}.{name}.{target}',(256,),False)
    result['layer_norm_16.scale']=('final_norm.weight',(256,),False)
    result['layer_norm_16.offset']=('final_norm.bias',(256,),False)
    return result


def read_official_arrays(checkpoint: str | Path) -> dict[str,np.ndarray]:
    import tensorstore as ts
    checkpoint=Path(checkpoint).resolve()
    if checkpoint.name!='params' or checkpoint.parent.name!='6400000':
        raise ValueError('use official step 6400000/params, not params_ema')
    kv={'driver':'ocdbt','base':{'driver':'file','path':str(checkpoint)+'/'}}
    store=ts.KvStore.open(kv).result()
    paths={k.decode().removesuffix('/.zarray') for k in store.list().result() if k.endswith(b'/.zarray')}
    mapping=parameter_mapping()
    if paths!=set(mapping):raise ValueError(f'checkpoint keys mismatch: missing={set(mapping)-paths}, extra={paths-set(mapping)}')
    arrays={}
    for key,(_,shape,_) in mapping.items():
        a=ts.open({'driver':'zarr','kvstore':kv,'path':key},open=True).result()
        if tuple(a.shape)!=shape or a.dtype.numpy_dtype!=np.dtype('float32'):
            raise ValueError(f'invalid shape/dtype at {key}')
        arrays[key]=np.asarray(a.read().result())
        if not np.isfinite(arrays[key]).all():raise ValueError(f'nonfinite parameter at {key}')
    return arrays


def convert_arrays(arrays):
    mapping=parameter_mapping()
    if set(arrays)!=set(mapping):raise ValueError('checkpoint keys mismatch')
    state={}
    for key,(target,shape,transpose) in mapping.items():
        a=arrays[key]
        if a.shape!=shape or a.dtype!=np.float32 or not np.isfinite(a).all():
            raise ValueError(f'invalid shape/dtype/values at {key}')
        state[target]=torch.from_numpy((a.T if transpose else a).copy())
    model=ActionValue9M()
    model.load_state_dict(state,strict=True);model.eval()
    return model,{'format_version':1,'architecture':'deepmind-9m-action-value','config':dict(CONFIG),
                  'parameter_count':sum(p.numel() for p in model.parameters()),'tensor_count':len(state),
                  'source_revision':REVISION,'archive_sha256':ARCHIVE_SHA256,'checkpoint_step':6400000,
                  'parameter_selection':'params','attribution':'Google DeepMind searchless_chess',
                  'weights_license':'CC-BY-4.0','modifications':'Haiku to PyTorch tensor layout conversion'}


def load_official(checkpoint):
    return convert_arrays(read_official_arrays(checkpoint))


def expected_values(logits: torch.Tensor) -> torch.Tensor:
    """Official uniform 128 return-bucket centers, current mover perspective."""
    if logits.shape[-1]!=128:raise ValueError('expected 128 bucket logits')
    centers=(torch.arange(128,device=logits.device,dtype=logits.dtype)+.5)/128
    return (torch.softmax(logits,dim=-1)*centers).sum(dim=-1)


@torch.no_grad()
def rank_legal(model: ActionValue9M, board: chess.Board, *, batch_size=8,
               adjust_repetitions=True) -> list[dict]:
    """All legal actions, maximum expected return; official repetition override.

    batch_size bounds activation memory; no engine/search or move sampling.
    Expected values are not probabilities normalized across the legal moves.
    """
    if batch_size<1:raise ValueError('batch_size must be positive')
    moves=sorted(board.legal_moves,key=lambda m:m.uci())
    if not moves:return []
    device=next(model.parameters()).device
    tokens=encode_state_actions(board.fen(),moves)
    values=[]
    for chunk in tokens.split(batch_size):
        values.extend(expected_values(model(chunk.to(device))).cpu().tolist())
    if adjust_repetitions:
        for i,move in enumerate(moves):
            board.push(move)
            try:
                if board.is_fivefold_repetition() or board.can_claim_threefold_repetition():values[i]=.5
            finally:board.pop()
    return sorted([{'move':m.uci(),'expected_value':v} for m,v in zip(moves,values)],
                  key=lambda row:(-row['expected_value'],row['move']))


def save_converted(model: ActionValue9M,path: str | Path,metadata: dict):
    path=Path(path).resolve()
    if '.cache' not in path.parts:raise ValueError('weights must stay in a .cache directory')
    if metadata.get('config')!=CONFIG or metadata.get('parameter_selection')!='params':
        raise ValueError('unexpected checkpoint configuration')
    path.parent.mkdir(parents=True,exist_ok=True)
    torch.save({'metadata':dict(metadata),'state_dict':{k:v.detach().cpu().clone() for k,v in model.state_dict().items()}},path)


def load_converted(path: str | Path):
    payload=torch.load(path,map_location='cpu',weights_only=True)
    metadata=payload['metadata']
    if (metadata.get('format_version')!=1 or metadata.get('architecture')!='deepmind-9m-action-value'
        or metadata.get('config')!=CONFIG or metadata.get('parameter_selection')!='params'
        or metadata.get('source_revision')!=REVISION or metadata.get('archive_sha256')!=ARCHIVE_SHA256):
        raise ValueError('unexpected action-value checkpoint metadata')
    state=payload['state_dict'];model=ActionValue9M()
    expected=model.state_dict()
    if set(state)!=set(expected):raise ValueError('converted checkpoint keys mismatch')
    for key,value in state.items():
        if value.shape!=expected[key].shape or value.dtype!=torch.float32 or not torch.isfinite(value).all().item():
            raise ValueError(f'invalid converted shape/dtype/values at {key}')
    model.load_state_dict(state,strict=True);model.eval()
    return model,metadata


def main():
    """Local conversion and legal all-action inference; no engine invocation."""
    import argparse,json,time
    parser=argparse.ArgumentParser(description=__doc__)
    source=parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--checkpoint',type=Path)
    source.add_argument('--converted',type=Path)
    source.add_argument('--archive',type=Path)
    parser.add_argument('--extract-to',type=Path,default=Path('.cache/research/weights'))
    parser.add_argument('--save',type=Path)
    parser.add_argument('--fen',default=chess.STARTING_FEN)
    parser.add_argument('--batch-size',type=int,default=8)
    parser.add_argument('--threads',type=int,default=1)
    parser.add_argument('--top',type=int,default=5)
    args=parser.parse_args()
    if min(args.batch_size,args.threads,args.top)<1:parser.error('batch-size, threads and top must be positive')
    torch.set_num_threads(args.threads)
    if args.converted:model,metadata=load_converted(args.converted)
    else:
        checkpoint=extract_official(args.archive,args.extract_to) if args.archive else args.checkpoint
        model,metadata=load_official(checkpoint)
    if args.save:save_converted(model,args.save,metadata)
    board=chess.Board(args.fen)
    start=time.perf_counter();ranked=rank_legal(model,board,batch_size=args.batch_size);elapsed=time.perf_counter()-start
    print(json.dumps({'metadata':metadata,'fen':board.fen(),'legal_move_count':len(ranked),
        'batch_size':args.batch_size,'threads':args.threads,'inference_seconds':elapsed,'top_moves':ranked[:args.top]},indent=2))


if __name__=='__main__':main()


