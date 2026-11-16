"""Fresh validation selection; freezes all three families before new test exposure."""
import copy,hashlib,json,shutil,sys,time
from pathlib import Path
import torch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
from action_value import load_converted,save_converted,encode_state_actions
from fine_tune_head import measure

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 torch.set_num_threads(1);folder=ROOT/'.cache/v7';out=ROOT/'evaluation/v0.7'
 if (folder/'test-exposed.json').exists() or (folder/'selection.json').exists():raise RuntimeError('v7 frozen')
 protocol=json.loads((out/'data-protocol.json').read_text());assert protocol.get('finishedAt')
 data=folder/'validation.json';assert sha(data)==protocol['splitSHA256']['validation']
 base=ROOT/'.cache/deepmind-v5/adapted.pt';model,metadata=load_converted(base)
 proposals=json.loads((out/'head-proposals.json').read_text());assert sha(base)==proposals['baseSHA256']
 cache=folder/'features/validation';cache.mkdir(parents=True,exist_ok=True);rows=[]
 source={str(p.relative_to(ROOT)):sha(p) for p in [ROOT/'spikes/deepmind-9m/model.py',ROOT/'spikes/deepmind-9m/action_value.py']}
 for index,row in enumerate(json.loads(data.read_text())):
  legal=row['legal'];binding=hashlib.sha256(json.dumps({'base':sha(base),'source':source,'fen':row['fen'],'legal':legal,'batch':8},sort_keys=True).encode()).hexdigest();path=cache/(row['id']+'.pt')
  if path.exists():
   entry=torch.load(path,weights_only=True);assert entry['binding']==binding;features=entry['features']
  else:
   with torch.no_grad():features=torch.cat([model.forward_features(encode_state_actions(row['fen'],legal[i:i+8])) for i in range(0,len(legal),8)])
   torch.save({'binding':binding,'features':features},path)
  assert features.shape==(len(legal),256) and torch.isfinite(features).all()
  target=torch.zeros(len(legal));best=legal.index(row['bestmove']);target[best]=.75
  probabilities=.25*torch.softmax(1-torch.tensor([m['rank'] for m in row['teacher']],dtype=torch.float32),0)
  for p,m in zip(probabilities,row['teacher']):target[legal.index(m['move'])]+=p
  rows.append({'id':row['id'],'features':features,'target':target,'best':best})
  if (index+1)%20==0:print('Fresh validation features',index+1,flush=True)
 results=[]
 for proposal in proposals['proposals']:
  path=ROOT/proposal['file'];assert sha(path)==proposal['sha256'];head=copy.deepcopy(model.head);head.load_state_dict(torch.load(path,weights_only=True));metric=measure(head,rows)
  results.append({**proposal,'freshValidation':metric});print(json.dumps({'id':proposal['id'],**metric}),flush=True)
 # This rule follows the recorded protocol: hits, policy cross entropy, then smallest modification.
 results.sort(key=lambda r:(-r['freshValidation']['top1'],r['freshValidation']['crossEntropy'],r['changedHeadScalars'],r['id']))
 winner=results[0];control=next(r for r in results if r['changedHeadScalars']==0)
 target=folder/'deepmind-selected.pt'
 if winner['changedHeadScalars']==0:shutil.copyfile(base,target)
 else:
  before={k:v.clone() for k,v in model.state_dict().items()};model.head.load_state_dict(torch.load(ROOT/winner['file'],weights_only=True))
  for k,v in model.state_dict().items():
   if not k.startswith('head.'):assert torch.equal(v,before[k])
  metadata=copy.deepcopy(metadata);metadata['modifications']+='; v7 inspected-head proposal selected on fresh validation';metadata['v7']={'proposal':winner['id'],'settings':winner['settings'],'baseSHA256':sha(base)}
  save_converted(model,target,metadata)
 report={'validationSHA256':sha(data),'results':results,'selected':winner['id'],'control':control['id'],'selectedCheckpointSHA256':sha(target),'sourceSHA256':sha(Path(__file__))}
 (out/'head-validation.json').write_text(json.dumps(report,indent=2)+'\n')
 sparse=json.loads((folder/'sparse-selection.json').read_text())
 selection={'frozenAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'dataProtocolSHA256':sha(out/'data-protocol.json'),'validationSHA256':sha(data),'sparse':sparse,'deepmind':{'winner':winner['id'],'file':str(target.relative_to(ROOT)),'sha256':sha(target),'controlFile':str(base.relative_to(ROOT)),'controlSHA256':sha(base),'validation':winner['freshValidation'],'controlValidation':control['freshValidation'],'changedHeadScalars':winner['changedHeadScalars']},'reportsSHA256':{name:sha(out/name) for name in ['sparse-validation.json','head-validation.json','head-proposals.json','sparse-proposals.json']}}
 (folder/'selection.json').write_text(json.dumps(selection,indent=2)+'\n');(out/'selection.json').write_text(json.dumps(selection,indent=2)+'\n');print(json.dumps(selection),flush=True)
if __name__=='__main__':main()
