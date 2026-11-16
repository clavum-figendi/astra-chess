"""Bounded, policy-supervised fine-tuning of verified DeepMind action values."""
import copy,hashlib,json,time
from pathlib import Path
import chess
import torch
from action_value import load_converted,save_converted,encode_state_actions,expected_values
from fine_tune_head import fit_value_head
ROOT=Path(__file__).resolve().parents[2];DIR=ROOT/'.cache/deepmind-v5';OUT=ROOT/'evaluation/v0.5'
BASE=ROOT/'.cache/research/deepmind-9m-action-value.pt'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
if (DIR/'test-exposed.json').exists() or (DIR/'selection.json').exists():raise RuntimeError('Run frozen/test exposed; refuse fitting')
protocol=json.loads((OUT/'data-protocol.json').read_text())
if not protocol.get('finishedAt'):raise RuntimeError('Teacher generation incomplete')
torch.set_num_threads(1);torch.manual_seed(42)
model,metadata=load_converted(BASE);model.eval();base_hash=sha(BASE)
source_hashes={str(p.relative_to(ROOT)):sha(p) for p in [Path(__file__),Path(__file__).with_name('fine_tune_head.py'),Path(__file__).with_name('action_value.py'),Path(__file__).with_name('model.py')]}
cache_identity={'checkpointSHA256':base_hash,'sources':source_hashes,'dataset':protocol['protocolSHA'],'batchSize':8}
cache_digest=hashlib.sha256(json.dumps(cache_identity,sort_keys=True).encode()).hexdigest()
start=time.monotonic();all_rows={}
for split in ['train','validation']:
    file=DIR/f'{split}.json'
    if sha(file)!=protocol['splitSHA256'][split]:raise RuntimeError('Teacher digest mismatch')
    labels=json.loads(file.read_text());rows=[];folder=DIR/'features'/split;folder.mkdir(parents=True,exist_ok=True)
    for n,row in enumerate(labels):
        legal=row['legal'];board=chess.Board(row['fen'])
        if len(set(legal))!=len(legal) or set(legal)!={m.uci() for m in board.legal_moves}:raise RuntimeError('Legal set mismatch')
        cache=folder/(row['id']+'.pt')
        if cache.exists():
            entry=torch.load(cache,map_location='cpu',weights_only=True)
            if entry['identity']!=cache_digest or entry['legal']!=legal:raise RuntimeError('Feature cache binding mismatch')
            features=entry['features']
        else:
            chunks=[]
            with torch.no_grad():
                for offset in range(0,len(legal),8):chunks.append(model.forward_features(encode_state_actions(row['fen'],legal[offset:offset+8])).detach().cpu())
            features=torch.cat(chunks)
            torch.save({'identity':cache_digest,'legal':legal,'features':features},cache)
        if features.shape!=(len(legal),256) or not torch.isfinite(features).all():raise RuntimeError('Invalid features')
        teacher=row['teacher'];ranks=torch.tensor([m['rank'] for m in teacher],dtype=torch.float32)
        probabilities=.25*torch.softmax(1-ranks,dim=0);target=torch.zeros(len(legal));best=legal.index(row['bestmove']);target[best]=.75
        for p,m in zip(probabilities,teacher):target[legal.index(m['move'])]+=p
        rows.append({'id':row['id'],'fen':row['fen'],'legal':legal,'features':features,'target':target,'best':best})
        if (n+1)%25==0:print(json.dumps({'cache':split,'positions':n+1,'total':len(labels),'seconds':time.monotonic()-start}),flush=True)
    all_rows[split]=rows
baseline_state={k:v.detach().clone() for k,v in model.state_dict().items()}
result=fit_value_head(model.head,all_rows['train'],all_rows['validation'],epochs=30,lr=1e-4,patience=6,on_epoch=lambda r:print(json.dumps(r),flush=True))
model.head.load_state_dict(result['state_dict'])
for k,v in model.state_dict().items():
    if not k.startswith('head.') and not torch.equal(v,baseline_state[k]):raise RuntimeError('Encoder changed')
changed=sum(int((v!=baseline_state[k]).sum()) for k,v in model.state_dict().items())
metadata=copy.deepcopy(metadata);metadata['modifications']='Chess Lab: policy-supervised output-head adaptation; encoder unchanged'
metadata['adaptation']={'protocolSHA':protocol['protocolSHA'],'baseCheckpointSHA256':base_hash,'changedParameters':changed,'selectedEpoch':result['selected_epoch'],'teacher':'Stockfish 17.1 depth10 MultiPV4','objective':'75% bestmove + 25% rank target; policy CE over expected returns; prior bucket KL'}
path=DIR/'adapted.pt';save_converted(model,path,metadata)
restored,_=load_converted(path)
for k,v in model.state_dict().items():assert torch.equal(v,restored.state_dict()[k])
report={k:v for k,v in result.items() if k!='state_dict'}
report.update({'sourceHashes':source_hashes,'baseCheckpointSHA256':base_hash,'adaptedSHA256':sha(path),'bytes':path.stat().st_size,'changedParameters':changed,'featureIdentity':cache_identity,'datasetSHA256':{s:protocol['splitSHA256'][s] for s in ['train','validation']},'finishedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'durationSeconds':time.monotonic()-start,'testRead':False})
(OUT/'adaptation.json').write_text(json.dumps(report,indent=2)+'\n')
selection={'baseCheckpointSHA256':base_hash,'adaptedSHA256':sha(path),'adaptationSHA256':sha(OUT/'adaptation.json'),'frozenAt':report['finishedAt'],'selectedEpoch':result['selected_epoch'],'changedParameters':changed}
(DIR/'selection.json').write_text(json.dumps(selection,indent=2)+'\n');print(json.dumps({'frozen':selection,'baseline':result['baseline'],'selected':result['selected']}),flush=True)
