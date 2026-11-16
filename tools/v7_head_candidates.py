"""Bounded head proposals; never reads v7 validation or final-test labels."""
import copy,hashlib,json,sys
from pathlib import Path
import torch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
from action_value import load_converted
from fine_tune_head import fit_value_head,measure

def structured_head(head,scale,draw_bias):
 if scale not in [.95,1.,1.05] or draw_bias not in [-.05,0.,.05]:raise ValueError('Outside declared budget')
 result=copy.deepcopy(head)
 with torch.no_grad():result.weight.mul_(scale);result.bias.mul_(scale);result.bias[63].add_(draw_bias)
 return result

def main():
 torch.set_num_threads(1);torch.manual_seed(42)
 folder=ROOT/'.cache/v7';out=ROOT/'evaluation/v0.7';folder.mkdir(exist_ok=True)
 if (folder/'selection.json').exists() or (folder/'test-exposed.json').exists():raise RuntimeError('v7 selection frozen')
 target=folder/'heads';target.mkdir(exist_ok=True)
 if (out/'head-proposals.json').exists():raise RuntimeError('Proposals already generated; do not overwrite')
 model,_=load_converted(ROOT/'.cache/deepmind-v5/adapted.pt')
 base,_=load_converted(ROOT/'.cache/research/deepmind-9m-action-value.pt')
 for k,t in model.state_dict().items():
  if not k.startswith('head.'):assert torch.equal(t,base.state_dict()[k])
 receipt=json.loads((ROOT/'evaluation/v0.5/adaptation.json').read_text())
 identity=hashlib.sha256(json.dumps(receipt['featureIdentity'],sort_keys=True).encode()).hexdigest()
 splits={}
 for split in ['train','validation']:
  path=ROOT/f'.cache/deepmind-v5/{split}.json';assert hashlib.sha256(path.read_bytes()).hexdigest()==receipt['datasetSHA256'][split]
  rows=[]
  for row in json.loads(path.read_text()):
   entry=torch.load(ROOT/f'.cache/deepmind-v5/features/{split}/{row["id"]}.pt',weights_only=True)
   assert entry['identity']==identity and entry['legal']==row['legal']
   legal=row['legal'];target_probs=torch.zeros(len(legal));best=legal.index(row['bestmove']);target_probs[best]=.75
   soft=.25*torch.softmax(1-torch.tensor([m['rank'] for m in row['teacher']],dtype=torch.float32),0)
   for prob,m in zip(soft,row['teacher']):target_probs[legal.index(m['move'])]+=prob
   rows.append({'id':row['id'],'features':entry['features'],'target':target_probs,'best':best})
  splits[split]=rows
 records=[]
 def save(name,head,settings,fit=None):
  p=folder/'heads'/f'{name}.pt';state={k:v.detach().clone() for k,v in head.state_dict().items()};torch.save(state,p)
  metrics=measure(head,splits['validation']);record={'id':name,'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'settings':settings,'developmentValidation':metrics,'changedHeadScalars':sum(int((v!=model.head.state_dict()[k]).sum()) for k,v in state.items())}
  if fit:record['fitting']={k:v for k,v in fit.items() if k!='state_dict'}
  records.append(record);print(json.dumps({k:v for k,v in record.items() if k!='fitting'}),flush=True)
 for scale in [.95,1.,1.05]:
  for bias in [-.05,0.,.05]:save(f'scale-{scale}-draw-{bias}',structured_head(model.head,scale,bias),{'type':'structured-inspection-edit','scale':scale,'drawBucket63Bias':bias})
 for lr in [2e-5,5e-5]:
  fitted=fit_value_head(model.head,splits['train'],splits['validation'],epochs=12,lr=lr,patience=4)
  head=copy.deepcopy(model.head);head.load_state_dict(fitted['state_dict']);save(f'policy-lr-{lr}',head,{'type':'policy-head-fit','lr':lr},fitted)
 report={'sourceSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'baseSHA256':hashlib.sha256((ROOT/'.cache/deepmind-v5/adapted.pt').read_bytes()).hexdigest(),'v7LabelsRead':False,'proposals':records}
 (out/'head-proposals.json').write_text(json.dumps(report,indent=2)+'\n')
if __name__=='__main__':main()
