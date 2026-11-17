"""Independent raw-FEN encoder/cache and folded-checkpoint checks (v5 only)."""
import sys,json,hashlib
from pathlib import Path
import torch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
from action_value import load_converted,encode_state_actions,expected_values

def main():
    torch.set_num_threads(1);torch.set_num_interop_threads(1)
    p=ROOT/'.cache/v8/weight-deepmind-rank1-0.5.pt';model,_=load_converted(p);control,_=load_converted(ROOT/'.cache/v7/deepmind-selected.pt');checks=[]
    with torch.no_grad():
        for split in ['train','validation']:
            row=json.loads((ROOT/f'.cache/deepmind-v5/{split}.json').read_text())[0]
            tokens=encode_state_actions(row['fen'],row['legal']);features=torch.cat([model.forward_features(t) for t in tokens.split(8)])
            cached=torch.load(ROOT/f'.cache/deepmind-v5/features/{split}/{row["id"]}.pt',weights_only=True)['features']
            error=float((features-cached).abs().max());assert error<=1e-5
            values=expected_values(model.head(features));cached_values=expected_values(model.head(cached))
            order=sorted(range(len(row['legal'])),key=lambda i:(-float(values[i]),row['legal'][i]));cached_order=sorted(range(len(row['legal'])),key=lambda i:(-float(cached_values[i]),row['legal'][i]))
            assert order==cached_order
            checks.append({'split':split,'id':row['id'],'legalCount':len(row['legal']),'maxFeatureError':error,'legalOrderIdentical':True,'move':row['legal'][order[0]]})
    changed={k:int((v!=control.state_dict()[k]).sum()) for k,v in model.state_dict().items()};assert all(n==0 for k,n in changed.items() if not k.startswith('head.weight'))
    report={'candidateSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'rawFenChecks':checks,'changedByTensor':changed,'architectureParameterCount':sum(p.numel() for p in model.parameters()),'newV8ValidationOrTestRead':False}
    (ROOT/'evaluation/v0.8/weight-deepmind-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if __name__=='__main__':main()
